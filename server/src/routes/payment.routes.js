import { Router } from "express";
import express from "express";
import {
  createIntent,
  confirmIntent,
  cancelIntent,
  getIntents,
  getIntentById,
  handleWebhook,
  // Stripe-specific imports
  createCheckoutSession,
  handleStripeWebhookController,
  getSessionStatus,
  getIntentPaymentStatus,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

/**
 * Payment Routes - Payment flow management
 *
 * WHY payment routes:
 * - Separate concerns: payments vs bookings
 * - Different lifecycle (intent → payment → booking)
 * - Some endpoints need auth, some don't (webhooks)
 *
 * PAYMENT FLOW:
 * 1. Create intent (authenticated)
 * 2. Frontend integrates with payment gateway
 * 3. Gateway processes payment
 * 4. Confirm intent (authenticated OR webhook)
 * 5. Booking created automatically
 */

const router = Router();

/**
 * POST /api/v1/payments/intents
 *
 * Create booking intent (temporary reservation)
 *
 * Body:
 * - slotId (required): The slot to reserve
 * - amount (required): Payment amount
 * - currency (optional): Currency code (default: USD)
 * - metadata (optional): Additional data
 *
 * Auth: Required (JWT)
 *
 * Response: Created intent with expiry time
 *
 * WHY create intent:
 * - Hold slot temporarily during payment
 * - User gets time to complete payment
 * - Auto-expires if not completed
 *
 * FLOW:
 * 1. User selects slot
 * 2. Frontend calls this endpoint
 * 3. Intent created with expiry
 * 4. Frontend redirects to payment gateway
 * 5. User completes payment
 * 6. Confirm intent (see POST /confirm below)
 */
router.post("/intents", verifyJWT, createIntent);

/**
 * GET /api/v1/payments/intents
 *
 * Get user's booking intents
 *
 * Query params:
 * - status (optional): PENDING, CONFIRMED, EXPIRED, CANCELLED
 *
 * Auth: Required (JWT)
 *
 * Response: Array of user's intents
 *
 * WHY GET intents:
 * - User can see pending payments
 * - Track payment history
 * - Check expiry status
 */
router.get("/intents", verifyJWT, getIntents);

/**
 * GET /api/v1/payments/intents/:intentId
 *
 * Get specific intent with countdown
 *
 * Auth: Required (JWT)
 *
 * Response: Intent details with remaining time
 *
 * WHY GET by ID:
 * - Frontend polls for status
 * - Show countdown timer
 * - Check if expired
 */
router.get("/intents/:intentId", verifyJWT, getIntentById);

/**
 * POST /api/v1/payments/intents/:intentId/confirm
 *
 * Confirm booking intent after payment success
 *
 * Body:
 * - paymentId (required): Payment gateway transaction ID
 * - paymentMethod (optional): CARD, UPI, etc.
 * - gateway (optional): STRIPE, RAZORPAY, etc.
 * - gatewayResponse (optional): Full gateway response
 *
 * Auth: Required (JWT)
 *
 * Response: Confirmed booking + payment record
 *
 * WHY confirm endpoint:
 * - Called after payment success
 * - Creates actual booking
 * - Increments slot.bookedCount
 * - Links payment to booking
 *
 * FLOW:
 * 1. User completes payment on gateway
 * 2. Gateway redirects back to frontend
 * 3. Frontend calls this endpoint with payment ID
 * 4. Backend confirms booking
 * 5. User sees confirmation
 */
router.post("/intents/:intentId/confirm", verifyJWT, confirmIntent);

/**
 * DELETE /api/v1/payments/intents/:intentId
 *
 * Cancel booking intent before payment
 *
 * Auth: Required (JWT)
 *
 * Response: Cancelled intent
 *
 * WHY cancel:
 * - User changes mind
 * - Release slot immediately
 * - Don't wait for expiry timeout
 * - Better UX
 */
router.delete("/intents/:intentId", verifyJWT, cancelIntent);

/**
 * POST /api/v1/payments/webhooks
 *
 * Handle payment gateway webhooks
 *
 * Body: Gateway-specific webhook payload
 *
 * Auth: None (webhooks come from gateway, not user)
 *
 * Response: 200 OK (fast acknowledgment)
 *
 * WHY webhooks:
 * - Payment gateways notify asynchronously
 * - User might close browser before redirect
 * - Ensures we don't miss confirmations
 * - Required for reliable payment processing
 *
 * SECURITY:
 * - Should verify webhook signature (gateway-specific)
 * - Validate payload before processing
 * - Return 200 quickly to prevent retries
 *
 * NOTE: In production, add webhook signature verification middleware
 */
router.post("/webhooks", handleWebhook);

// ============ STRIPE-SPECIFIC ROUTES ============

/**
 * POST /api/v1/payments/stripe/create-checkout-session
 *
 * Create Stripe Checkout Session
 *
 * Body:
 * - bookingIntentId (required): Existing BookingIntent ID
 * - successUrl (required): Redirect URL after successful payment
 * - cancelUrl (required): Redirect URL if user cancels
 *
 * Auth: Required (JWT)
 *
 * Response: { checkoutUrl, sessionId, expiresAt }
 *
 * CRITICAL FLOW:
 * 1. User creates BookingIntent first (POST /intents)
 * 2. Call this endpoint to get Stripe Checkout URL
 * 3. Redirect user to checkoutUrl
 * 4. User completes payment on Stripe
 * 5. Stripe webhook confirms booking automatically
 * 6. User redirected back to successUrl
 *
 * WHY TWO-STEP PROCESS:
 * - BookingIntent reserves slot first (fail fast if slot unavailable)
 * - Then create Stripe session (only if slot available)
 * - Prevents failed payments for unavailable slots
 *
 * EXAMPLE REQUEST:
 * POST /api/v1/payments/stripe/create-checkout-session
 * {
 *   "bookingIntentId": "65f1234567890abcdef12345",
 *   "successUrl": "https://yourapp.com/booking/success",
 *   "cancelUrl": "https://yourapp.com/booking/cancel"
 * }
 */
router.post(
  "/stripe/create-checkout-session",
  verifyJWT,
  createCheckoutSession
);

/**
 * POST /api/v1/payments/stripe/webhook
 *
 * Stripe Webhook Handler
 *
 * Body: Raw Stripe webhook payload (NOT JSON)
 * Header: stripe-signature (required)
 *
 * Auth: None (signature verification instead)
 *
 * Response: 200 OK
 *
 * CRITICAL SETUP:
 * - This route MUST use express.raw() middleware (not express.json())
 * - Raw body required for signature verification
 * - Configure in app.js BEFORE express.json()
 *
 * EXAMPLE APP.JS CONFIG:
 * app.use('/api/v1/payments/stripe/webhook', express.raw({ type: 'application/json' }));
 * app.use(express.json()); // After webhook route
 *
 * STRIPE EVENTS HANDLED:
 * - checkout.session.completed: Payment UI completed
 * - payment_intent.succeeded: Payment confirmed → BOOKING CREATED
 * - payment_intent.payment_failed: Payment failed → Intent expired
 *
 * LOCAL TESTING:
 * 1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
 * 2. Run: stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook
 * 3. Copy webhook secret to .env: STRIPE_WEBHOOK_SECRET=whsec_...
 * 4. Test: stripe trigger payment_intent.succeeded
 *
 * IDEMPOTENCY:
 * - Safe to call multiple times for same event
 * - Stripe may retry if no response
 * - Service checks stripeEventId to prevent duplicates
 */
// Note: This route needs raw body middleware (see app.js)
router.post("/stripe/webhook", handleStripeWebhookController);

/**
 * GET /api/v1/payments/stripe/session/:sessionId/status
 *
 * Get Stripe Checkout Session status
 *
 * Auth: Required (JWT)
 *
 * Response: { status, paymentStatus, amountTotal, currency }
 *
 * WHY THIS ENDPOINT:
 * - Frontend can poll payment status
 * - Check if payment completed without webhook
 * - Customer support can verify payment
 * - Debugging
 *
 * STATUSES:
 * - status: "open" (in progress), "complete" (done), "expired" (timeout)
 * - paymentStatus: "paid", "unpaid", "no_payment_required"
 */
router.get("/stripe/session/:sessionId/status", verifyJWT, getSessionStatus);

/**
 * GET /api/v1/payments/intents/:intentId/status
 *
 * Get payment status for BookingIntent
 *
 * Auth: Required (JWT)
 *
 * Response: {
 *   intentStatus, paymentStatus, amount, currency,
 *   stripeSessionId, stripePaymentIntentId,
 *   paymentMethod, paymentGateway, expiresAt, isExpired
 * }
 *
 * WHY THIS ENDPOINT:
 * - Show complete payment details to user
 * - Check if payment completed
 * - Display payment method, gateway, expiry
 * - Frontend can show progress: "Intent created → Payment pending → Confirmed"
 */
router.get("/intents/:intentId/status", verifyJWT, getIntentPaymentStatus);

export default router;
