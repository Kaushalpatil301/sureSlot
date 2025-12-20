import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import {
  createBookingIntent,
  confirmBookingIntent,
  cancelBookingIntent,
  getUserIntents,
  processPaymentWebhook,
  // Stripe-specific imports
  createStripeCheckoutSession,
  handleStripeWebhook,
  getStripeSessionStatus,
  getPaymentStatus,
} from "../services/payment.service.js";

/**
 * Payment Controller - Thin HTTP layer for payment operations
 *
 * WHY thin controllers:
 * - Only handle HTTP concerns (request parsing, response formatting)
 * - No business logic (delegates to payment.service)
 * - No direct model access
 * - Easy to test services independently
 * - Clear separation of concerns
 */

/**
 * POST /payments/intents
 * Body: { slotId, amount, currency?, metadata? }
 *
 * Creates a booking intent (temporary reservation)
 *
 * WHY create intent first:
 * - User needs time to complete payment
 * - Hold slot temporarily
 * - Prevents others from booking while paying
 */
export const createIntent = asyncHandler(async (req, res) => {
  const { slotId, amount, currency, metadata } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!slotId) {
    throw new ApiError(400, "slotId is required");
  }

  if (amount === undefined || amount < 0) {
    throw new ApiError(400, "Valid amount is required");
  }

  // Delegate to service
  // WHY no model access:
  // - Service handles transactional logic
  // - Controller just parses HTTP and formats response
  const intent = await createBookingIntent(userId, slotId, amount, {
    currency,
    metadata,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        intent,
        expiresIn: intent.getRemainingTime(), // Seconds remaining
      },
      "Booking intent created successfully"
    )
  );
});

/**
 * POST /payments/intents/:intentId/confirm
 * Body: { paymentId, paymentMethod?, gatewayResponse? }
 *
 * Confirms a booking intent after successful payment
 *
 * WHY separate confirmation endpoint:
 * - Payment happens externally (gateway)
 * - This endpoint is called after payment success
 * - Creates actual booking
 */
export const confirmIntent = asyncHandler(async (req, res) => {
  const { intentId } = req.params;
  const { paymentId, paymentMethod, gateway, gatewayResponse, metadata } =
    req.body;

  // Validate required fields
  if (!paymentId) {
    throw new ApiError(400, "paymentId is required");
  }

  // Delegate to service
  // WHY service handles confirmation:
  // - Coordinates intent, payment, and booking
  // - Reuses booking.service for slot logic
  // - Transactional consistency
  const result = await confirmBookingIntent(intentId, paymentId, {
    paymentMethod,
    gateway,
    gatewayResponse,
    metadata,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Booking confirmed successfully"));
});

/**
 * DELETE /payments/intents/:intentId
 *
 * Cancels a booking intent before payment
 *
 * WHY DELETE verb:
 * - RESTful: removes intent from active state
 * - User cancels before paying
 * - Releases slot immediately
 */
export const cancelIntent = asyncHandler(async (req, res) => {
  const { intentId } = req.params;
  const userId = req.user._id;

  // Delegate to service (authorization happens there)
  const intent = await cancelBookingIntent(intentId, userId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, intent, "Booking intent cancelled successfully")
    );
});

/**
 * GET /payments/intents
 * Query: ?status=PENDING (optional)
 *
 * Gets user's booking intents
 *
 * WHY separate from bookings:
 * - Intents are pre-payment
 * - Different lifecycle
 * - User might want to see pending payments
 */
export const getIntents = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;

  // Delegate to service
  const intents = await getUserIntents(userId, status);

  return res
    .status(200)
    .json(
      new ApiResponse(200, intents, `Found ${intents.length} booking intent(s)`)
    );
});

/**
 * GET /payments/intents/:intentId
 *
 * Gets a specific intent with remaining time
 *
 * WHY GET intent:
 * - Check expiry countdown
 * - Display to user during payment
 * - Frontend polling for status
 */
export const getIntentById = asyncHandler(async (req, res) => {
  const { intentId } = req.params;
  const userId = req.user._id;

  // Find intent
  const { BookingIntent } = await import("../models/bookingIntent.model.js");
  const intent = await BookingIntent.findById(intentId).populate("slotId");

  if (!intent) {
    throw new ApiError(404, "Booking intent not found");
  }

  // Verify ownership
  if (intent.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized to view this intent");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        intent,
        expiresIn: intent.getRemainingTime(),
        isExpired: intent.isExpired,
      },
      "Intent fetched successfully"
    )
  );
});

/**
 * POST /payments/webhooks
 * Body: Payment gateway webhook payload
 *
 * Handles payment gateway webhooks
 *
 * WHY webhooks:
 * - Payment gateways notify asynchronously
 * - User might close browser
 * - Ensures we don't miss confirmations
 * - Required for reliable payments
 *
 * NOTE: Should verify webhook signature in production
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  // Extract webhook data
  // WHY no authentication:
  // - Webhooks come from payment gateway, not user
  // - Should verify signature instead (gateway-specific)
  // - req.user won't be available
  const { paymentId, status, gateway } = req.body;

  if (!paymentId || !status) {
    throw new ApiError(400, "paymentId and status are required");
  }

  // Process webhook
  // WHY delegate to service:
  // - Complex logic (find payment, update, confirm booking)
  // - May involve transactions
  // - Controller stays thin
  const payment = await processPaymentWebhook(paymentId, status, {
    gateway: gateway || "STRIPE",
    ...req.body,
  });

  // Webhook responses should be fast and minimal
  // WHY 200 OK:
  // - Gateway expects quick acknowledgment
  // - Processing happens in service
  // - Gateway will retry if we don't respond
  return res.status(200).json({
    success: true,
    message: "Webhook processed",
    paymentId: payment._id,
  });
});

// ============ STRIPE-SPECIFIC ENDPOINTS ============

/**
 * POST /payments/stripe/create-checkout-session
 * Body: { bookingIntentId, successUrl, cancelUrl }
 *
 * Creates Stripe Checkout Session for BookingIntent
 *
 * CRITICAL:
 * - BookingIntent must already exist (created via POST /payments/intents)
 * - This endpoint ONLY creates payment session
 * - Does NOT create booking (booking created by webhook)
 *
 * FLOW:
 * 1. User creates BookingIntent (reserves slot temporarily)
 * 2. Call this endpoint to get Stripe Checkout URL
 * 3. Redirect user to Stripe Checkout
 * 4. User completes payment
 * 5. Stripe webhook confirms booking
 */
export const createCheckoutSession = asyncHandler(async (req, res) => {
  const { bookingIntentId, successUrl, cancelUrl } = req.body;

  // Validate required fields
  if (!bookingIntentId) {
    throw new ApiError(400, "bookingIntentId is required");
  }

  if (!successUrl || !cancelUrl) {
    throw new ApiError(400, "successUrl and cancelUrl are required");
  }

  // WHY validate URLs: Prevent open redirect vulnerability
  // In production, validate URLs belong to your domain
  if (!successUrl.startsWith("http") || !cancelUrl.startsWith("http")) {
    throw new ApiError(400, "URLs must be valid HTTP/HTTPS URLs");
  }

  // Delegate to service
  // WHY service:
  // - Handles Stripe API calls
  // - Updates BookingIntent
  // - Controller stays thin
  const result = await createStripeCheckoutSession(
    bookingIntentId,
    successUrl,
    cancelUrl
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        checkoutUrl: result.checkoutUrl,
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
      },
      "Stripe Checkout session created successfully"
    )
  );
});

/**
 * POST /payments/stripe/webhook
 * Raw body + Stripe-Signature header
 *
 * Handles Stripe webhook events
 *
 * CRITICAL SECURITY:
 * - MUST verify Stripe signature (prevents fake requests)
 * - Raw body required (not JSON parsed)
 * - Signature in header: stripe-signature
 *
 * IDEMPOTENCY:
 * - Safe to call multiple times for same event
 * - Stripe may retry webhooks
 * - Service checks stripeEventId to prevent duplicates
 *
 * SUPPORTED EVENTS:
 * - checkout.session.completed: Payment UI completed
 * - payment_intent.succeeded: Payment confirmed (BOOKING CREATED HERE)
 * - payment_intent.payment_failed: Payment failed
 */
export const handleStripeWebhookController = asyncHandler(async (req, res) => {
  // Get raw body and signature
  // WHY raw body:
  // - Stripe signature verification requires exact bytes
  // - JSON parsing would break signature
  // - Must use express.raw() middleware for this route
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    throw new ApiError(400, "Missing stripe-signature header");
  }

  // WHY req.rawBody:
  // - Set by express.raw() middleware
  // - Contains unparsed request body
  // - Required for signature verification
  const rawBody = req.body; // This will be Buffer if express.raw() used

  // Delegate to service for processing
  // WHY service:
  // - Complex webhook logic
  // - Signature verification
  // - Idempotency checking
  // - Booking confirmation
  const result = await handleStripeWebhook(rawBody, signature);

  // Stripe expects 200 OK quickly
  // WHY fast response:
  // - Stripe has timeout (30 seconds)
  // - If no response, Stripe retries
  // - Processing happens in service, we just acknowledge
  return res.status(200).json({
    success: true,
    message: result.message,
    eventId: result.eventId || null,
  });
});

/**
 * GET /payments/stripe/session/:sessionId/status
 *
 * Gets Stripe Checkout Session status
 *
 * WHY this endpoint:
 * - Frontend can poll payment status
 * - Verify payment without webhook
 * - Customer support can check status
 * - Debugging
 */
export const getSessionStatus = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    throw new ApiError(400, "sessionId is required");
  }

  // Delegate to service
  const status = await getStripeSessionStatus(sessionId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        status,
        "Stripe session status retrieved successfully"
      )
    );
});

/**
 * GET /payments/intents/:intentId/status
 *
 * Gets payment status for BookingIntent
 *
 * WHY this endpoint:
 * - Show payment details to user
 * - Check if payment completed
 * - Display payment method, gateway, etc.
 */
export const getIntentPaymentStatus = asyncHandler(async (req, res) => {
  const { intentId } = req.params;

  if (!intentId) {
    throw new ApiError(400, "intentId is required");
  }

  // Delegate to service
  const status = await getPaymentStatus(intentId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, status, "Payment status retrieved successfully")
    );
});

export default {
  createIntent,
  confirmIntent,
  cancelIntent,
  getIntents,
  getIntentById,
  handleWebhook,
  // Stripe-specific exports
  createCheckoutSession,
  handleStripeWebhookController,
  getSessionStatus,
  getIntentPaymentStatus,
};
