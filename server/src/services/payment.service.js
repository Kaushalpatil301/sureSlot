import Stripe from "stripe";
import { BookingIntent } from "../models/bookingIntent.model.js";
import { Payment } from "../models/payment.model.js";
import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";
import { createBooking } from "./booking.service.js";
import mongoose from "mongoose";
import env from "../config/env.js";

// Initialize Stripe with secret key from environment
// WHY separate initialization:
// - Fail fast if STRIPE_SECRET_KEY missing
// - Lock API version for stability (prevents breaking changes)
// - Single Stripe instance shared across all requests
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    })
  : null;

/**
 * Payment Service - Handles payment flow with booking intents
 *
 * WHY PAYMENT SERVICE DOES NOT DIRECTLY MANIPULATE SLOTS:
 * - Separation of concerns: payment handles money, booking handles inventory
 * - Booking service owns slot logic (single source of truth)
 * - Payment service delegates to booking service for confirmation
 * - No duplication of transactional slot logic
 * - Clearer responsibility boundaries
 *
 * PAYMENT FLOW:
 * 1. Create intent → temporary hold on slot
 * 2. Process payment → external gateway (async)
 * 3. On success → confirm booking (reuse booking.service)
 * 4. On timeout → auto-release (background job)
 */

/**
 * Creates a booking intent (temporary reservation)
 *
 * WHY INTENTS:
 * - User needs time to complete payment (enter card, OTP, etc.)
 * - Hold slot temporarily to prevent others from booking
 * - Auto-expires if payment not completed
 * - Models real-world payment behavior
 *
 * @param {String} userId - MongoDB ObjectId as string
 * @param {String} slotId - MongoDB ObjectId as string
 * @param {Number} amount - Payment amount
 * @param {Object} options - Additional options (metadata, currency)
 * @returns {Object} Created booking intent
 */
export const createBookingIntent = async (
  userId,
  slotId,
  amount,
  options = {}
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Check if user already has an active intent for this slot
    // WHY check:
    // - Prevents duplicate intents
    // - User can only have one pending payment per slot
    // - Avoids confusion and double charges
    const existingIntent = await BookingIntent.findActiveIntent(userId, slotId);

    if (existingIntent) {
      throw new ApiError(
        409,
        "You already have a pending booking intent for this slot"
      );
    }

    // Verify slot is available
    // WHY verify:
    // - Don't create intent for unavailable slots
    // - Fail fast before payment gateway call
    // - User gets immediate feedback
    const slot = await Slot.findById(slotId).session(session);

    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    if (slot.status !== "AVAILABLE") {
      throw new ApiError(400, "Slot is blocked or unavailable");
    }

    if (slot.bookedCount >= slot.capacity) {
      throw new ApiError(409, "Slot is fully booked");
    }

    if (slot.startTime <= new Date()) {
      throw new ApiError(400, "Cannot book a slot in the past");
    }

    // Calculate expiry time
    // WHY expiry:
    // - User has limited time to complete payment
    // - Prevents indefinite slot holds
    // - Typical: 10-15 minutes
    const expiryMinutes = env.BOOKING_INTENT_EXPIRY_MINUTES || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Create booking intent
    // WHY not increment slot yet:
    // - Payment not confirmed
    // - Intent might expire
    // - Slot stays available for others if payment fails
    // - Real booking happens only on payment success
    const intent = await BookingIntent.create(
      [
        {
          userId,
          slotId,
          amount,
          currency: options.currency || "USD",
          expiresAt,
          status: "PENDING",
          metadata: options.metadata || {},
        },
      ],
      { session }
    );

    await session.commitTransaction();

    // Return intent with slot details
    const createdIntent = await BookingIntent.findById(intent[0]._id).populate(
      "slotId"
    );

    return createdIntent;
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent creation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

/**
 * Confirms a booking intent after successful payment
 *
 * WHY REUSE BOOKING SERVICE:
 * - booking.service owns transactional slot logic
 * - No duplication of atomic increment logic
 * - Single source of truth for bookings
 * - Consistent validation and invariants
 *
 * @param {String} intentId - BookingIntent ObjectId as string
 * @param {String} paymentId - Payment gateway ID
 * @param {Object} paymentData - Payment details
 * @returns {Object} Confirmed booking
 */
export const confirmBookingIntent = async (
  intentId,
  paymentId,
  paymentData = {}
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Find intent
    const intent = await BookingIntent.findById(intentId).session(session);

    if (!intent) {
      throw new ApiError(404, "Booking intent not found");
    }

    // Verify intent is still valid
    // WHY verify:
    // - Prevent confirming expired intents
    // - Prevent double confirmation
    // - Ensure intent is in correct state
    if (intent.status !== "PENDING") {
      throw new ApiError(400, `Intent is ${intent.status.toLowerCase()}`);
    }

    if (intent.isExpired) {
      throw new ApiError(400, "Intent has expired");
    }

    // Create payment record
    // WHY create payment first:
    // - Payment confirmation happened
    // - Even if booking fails, we have payment record
    // - Required for refunds
    const payment = await Payment.create(
      [
        {
          bookingIntentId: intent._id,
          userId: intent.userId,
          amount: intent.amount,
          currency: intent.currency,
          status: "SUCCEEDED",
          paymentMethod: paymentData.paymentMethod || "CARD",
          paymentGateway: paymentData.gateway || "STRIPE",
          gatewayPaymentId: paymentId,
          gatewayResponse: paymentData.gatewayResponse || {},
          metadata: paymentData.metadata || {},
        },
      ],
      { session }
    );

    // Confirm booking using existing booking service
    // WHY delegate to booking.service:
    // - Reuses atomic slot increment logic
    // - Maintains all booking invariants
    // - No logic duplication
    // - Single responsibility: payment handles money, booking handles slots
    const booking = await createBooking(intent.userId, intent.slotId);

    // Update payment with booking reference
    payment[0].bookingId = booking._id;
    await payment[0].save({ session });

    // Mark intent as confirmed
    intent.status = "CONFIRMED";
    intent.paymentIntentId = paymentId;
    await intent.save({ session });

    await session.commitTransaction();

    return {
      booking,
      payment: payment[0],
      intent,
    };
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent confirmation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

/**
 * Cancels a booking intent before payment
 *
 * WHY CANCELLATION:
 * - User changes mind before paying
 * - Releases slot immediately
 * - Prevents waiting for expiry timeout
 * - Better UX and inventory management
 *
 * @param {String} intentId - BookingIntent ObjectId as string
 * @param {String} userId - User ID for authorization
 * @returns {Object} Cancelled intent
 */
export const cancelBookingIntent = async (intentId, userId) => {
  try {
    const intent = await BookingIntent.findById(intentId);

    if (!intent) {
      throw new ApiError(404, "Booking intent not found");
    }

    // Verify ownership
    if (intent.userId.toString() !== userId.toString()) {
      throw new ApiError(403, "Not authorized to cancel this intent");
    }

    // Check if intent can be cancelled
    if (intent.status !== "PENDING") {
      throw new ApiError(
        400,
        `Cannot cancel ${intent.status.toLowerCase()} intent`
      );
    }

    // Mark as cancelled
    // WHY not delete:
    // - Preserve audit trail
    // - Analytics on abandonment rates
    // - Potential refund scenarios
    intent.status = "CANCELLED";
    await intent.save();

    return intent;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent cancellation failed: ${error.message}`);
  }
};

/**
 * Expires a booking intent (called by background job)
 *
 * WHY EXPIRATION:
 * - Timeout reached, payment not completed
 * - Release slot back to inventory
 * - Automatic cleanup, no manual intervention
 * - Models abandoned cart behavior
 *
 * @param {String} intentId - BookingIntent ObjectId as string
 * @returns {Object} Expired intent
 */
export const expireBookingIntent = async (intentId) => {
  try {
    const intent = await BookingIntent.findById(intentId);

    if (!intent) {
      throw new ApiError(404, "Booking intent not found");
    }

    // Only expire pending intents
    if (intent.status !== "PENDING") {
      return intent; // Already processed
    }

    // Mark as expired
    // WHY not delete:
    // - Audit trail
    // - Analytics: abandonment rates, payment funnel
    // - Can send reminder emails
    intent.status = "EXPIRED";
    await intent.save();

    return intent;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent expiration failed: ${error.message}`);
  }
};

/**
 * Gets user's booking intents
 *
 * @param {String} userId - MongoDB ObjectId as string
 * @param {String} status - Optional status filter
 * @returns {Array} User's intents
 */
export const getUserIntents = async (userId, status = null) => {
  try {
    const filter = { userId };

    if (status) {
      if (!["PENDING", "CONFIRMED", "EXPIRED", "CANCELLED"].includes(status)) {
        throw new ApiError(
          400,
          "Invalid status. Use PENDING, CONFIRMED, EXPIRED, or CANCELLED"
        );
      }
      filter.status = status;
    }

    const intents = await BookingIntent.find(filter)
      .populate("slotId")
      .sort({ createdAt: -1 });

    return intents;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch intents: ${error.message}`);
  }
};

/**
 * Processes payment webhook (from payment gateway)
 *
 * WHY WEBHOOKS:
 * - Payment gateways notify asynchronously
 * - User might close browser before redirect
 * - Webhooks ensure we don't miss confirmations
 * - Required for reliable payment processing
 *
 * @param {String} gatewayPaymentId - Payment ID from gateway
 * @param {String} status - Payment status from gateway
 * @param {Object} webhookData - Full webhook payload
 * @returns {Object} Processing result
 */
export const processPaymentWebhook = async (
  gatewayPaymentId,
  status,
  webhookData = {}
) => {
  try {
    // Find payment by gateway ID
    let payment = await Payment.findByGatewayId(
      gatewayPaymentId,
      webhookData.gateway || "STRIPE"
    );

    if (!payment) {
      // Payment might not exist yet (race condition with webhook)
      // Create payment record from webhook
      throw new ApiError(404, "Payment not found for gateway ID");
    }

    // Update payment status based on webhook
    const previousStatus = payment.status;
    payment.status = status;
    payment.gatewayResponse = webhookData;
    await payment.save();

    // If payment succeeded and booking not created, confirm intent
    if (
      status === "SUCCEEDED" &&
      previousStatus !== "SUCCEEDED" &&
      !payment.bookingId
    ) {
      const intent = await BookingIntent.findById(payment.bookingIntentId);

      if (intent && intent.status === "PENDING") {
        await confirmBookingIntent(intent._id.toString(), gatewayPaymentId, {
          gateway: payment.paymentGateway,
          paymentMethod: payment.paymentMethod,
          gatewayResponse: webhookData,
        });
      }
    }

    return payment;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Webhook processing failed: ${error.message}`);
  }
};

// ============ STRIPE INTEGRATION ============

/**
 * Create Stripe Checkout Session for BookingIntent
 *
 * CRITICAL DESIGN:
 * - NEVER bypasses slot capacity rules
 * - ONLY confirms existing BookingIntent
 * - Uses booking.service.createBooking() as single source of truth
 *
 * FLOW:
 * 1. Fetch BookingIntent (verify exists and valid)
 * 2. Create Stripe Checkout Session
 * 3. Store stripeSessionId on BookingIntent
 * 4. Mark BookingIntent as PAYMENT_PENDING
 * 5. Return checkout URL
 *
 * WHY CHECKOUT SESSION:
 * - Hosted payment page (PCI compliance built-in)
 * - Handles 3D Secure, card validation automatically
 * - Less frontend code, more secure
 * - Stripe manages payment UX
 *
 * @param {String} bookingIntentId - MongoDB ObjectId as string
 * @param {String} successUrl - Redirect URL after successful payment
 * @param {String} cancelUrl - Redirect URL if user cancels
 * @returns {Object} { checkoutUrl, sessionId }
 */
export const createStripeCheckoutSession = async (
  bookingIntentId,
  successUrl,
  cancelUrl
) => {
  // Verify Stripe is configured
  if (!stripe) {
    throw new ApiError(
      500,
      "Stripe is not configured. Set STRIPE_SECRET_KEY environment variable."
    );
  }

  // Step 1: Fetch and validate BookingIntent
  const intent = await BookingIntent.findById(bookingIntentId).populate(
    "slotId"
  );

  if (!intent) {
    throw new ApiError(404, "BookingIntent not found");
  }

  // WHY check status: Prevent duplicate checkout sessions
  if (intent.status === "CONFIRMED") {
    throw new ApiError(400, "BookingIntent already confirmed");
  }

  if (intent.status === "EXPIRED" || intent.status === "CANCELLED") {
    throw new ApiError(400, `BookingIntent is ${intent.status.toLowerCase()}`);
  }

  // WHY check expiry: Don't create session for expired intents
  if (intent.expiresAt <= new Date()) {
    throw new ApiError(400, "BookingIntent has expired");
  }

  // WHY verify slot: Slot might have been deleted/blocked after intent creation
  if (!intent.slotId) {
    throw new ApiError(404, "Slot not found");
  }

  // Step 2: Create Stripe Checkout Session
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"], // Accept card payments
      line_items: [
        {
          price_data: {
            currency: intent.currency.toLowerCase(), // Stripe requires lowercase
            product_data: {
              name: "Appointment Booking",
              description: `Slot: ${new Date(
                intent.slotId.startTime
              ).toLocaleString()} - ${new Date(
                intent.slotId.endTime
              ).toLocaleString()}`,
            },
            unit_amount: Math.round(intent.amount * 100), // Stripe uses cents
            // WHY multiply by 100: $10.50 → 1050 cents
          },
          quantity: 1,
        },
      ],
      mode: "payment", // One-time payment (not subscription)
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      // WHY {CHECKOUT_SESSION_ID}: Stripe replaces with actual session ID
      // Frontend can use this to verify payment

      // CRITICAL: Store metadata for webhook processing
      metadata: {
        bookingIntentId: bookingIntentId.toString(),
        slotId: intent.slotId._id.toString(),
        userId: intent.userId.toString(),
        // WHY metadata: Webhooks receive this data
        // Enables linking payment back to our system
      },

      // WHY expires_at: Align with BookingIntent expiry
      expires_at: Math.floor(intent.expiresAt.getTime() / 1000), // Unix timestamp
      // Ensures Stripe session expires when intent expires
    });

    // Step 3: Store Stripe session ID on BookingIntent
    intent.stripeSessionId = session.id;
    intent.stripePaymentIntentId = session.payment_intent; // May be null initially
    intent.status = "PAYMENT_PENDING";
    await intent.save();

    return {
      checkoutUrl: session.url, // Frontend redirects user here
      sessionId: session.id,
      expiresAt: intent.expiresAt,
    };
  } catch (stripeError) {
    throw new ApiError(
      500,
      `Stripe session creation failed: ${stripeError.message}`
    );
  }
};

/**
 * Handle Stripe Webhook Events
 *
 * CRITICAL: IDEMPOTENT - safe to call multiple times for same event
 * - Stripe may send duplicate events (network retries, etc.)
 * - Use stripeEventId to prevent duplicate processing
 *
 * SUPPORTED EVENTS:
 * - checkout.session.completed: Payment UI completed (may not be confirmed yet)
 * - payment_intent.succeeded: Payment confirmed (BOOKING IS CREATED HERE)
 * - payment_intent.payment_failed: Payment failed
 *
 * WHY VERIFY SIGNATURE:
 * - Prevents malicious requests pretending to be Stripe
 * - Ensures request actually came from Stripe
 * - Required for security
 *
 * @param {String|Buffer} rawBody - Raw request body (needed for signature)
 * @param {String} signature - Stripe signature from header
 * @returns {Object} Processing result
 */
export const handleStripeWebhook = async (rawBody, signature) => {
  // Verify Stripe is configured
  if (!stripe) {
    throw new ApiError(500, "Stripe is not configured");
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new ApiError(500, "Stripe webhook secret is not configured");
  }

  let event;

  // Step 1: Verify webhook signature
  // WHY verify: Security - ensure request is from Stripe
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new ApiError(
      400,
      `Webhook signature verification failed: ${err.message}`
    );
  }

  // Step 2: Check if event already processed (idempotency)
  // WHY check: Prevent duplicate booking confirmations
  const existingPayment = await Payment.findOne({
    stripeEventId: event.id,
  });

  if (existingPayment) {
    console.log(`Event ${event.id} already processed, skipping`);
    return {
      message: "Event already processed",
      eventId: event.id,
      duplicate: true,
    };
  }

  // Step 3: Route event to handler
  let result;
  switch (event.type) {
    case "checkout.session.completed":
      result = await handleCheckoutSessionCompleted(event);
      break;

    case "payment_intent.succeeded":
      result = await handlePaymentIntentSucceeded(event);
      break;

    case "payment_intent.payment_failed":
      result = await handlePaymentIntentFailed(event);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
      return {
        message: "Event type not handled",
        eventType: event.type,
      };
  }

  return result;
};

/**
 * Handle checkout.session.completed event
 *
 * WHEN this fires:
 * - User completes Stripe Checkout UI
 * - Payment may not be confirmed yet (async methods like SEPA)
 *
 * WHAT we do:
 * - Create Payment record for audit trail
 * - Link Payment Intent ID to BookingIntent
 * - Wait for payment_intent.succeeded to confirm booking
 *
 * WHY not create booking here:
 * - Payment might still fail (bank declined, etc.)
 * - Wait for payment_intent.succeeded for final confirmation
 *
 * @param {Object} event - Stripe event object
 * @returns {Object} Processing result
 */
const handleCheckoutSessionCompleted = async (event) => {
  const session = event.data.object;
  const { bookingIntentId } = session.metadata;

  // Fetch BookingIntent
  const intent = await BookingIntent.findById(bookingIntentId);
  if (!intent) {
    console.error(
      `BookingIntent ${bookingIntentId} not found for event ${event.id}`
    );
    return { error: "BookingIntent not found" };
  }

  // Update intent with Payment Intent ID
  if (session.payment_intent) {
    intent.stripePaymentIntentId = session.payment_intent;
    await intent.save();
  }

  // Create Payment record for audit trail
  // WHY create now: Track payment attempt even if not confirmed yet
  await Payment.create({
    bookingIntentId: intent._id,
    userId: intent.userId,
    amount: intent.amount,
    currency: intent.currency,
    status: "PROCESSING", // Not confirmed yet
    paymentMethod: "CARD",
    paymentGateway: "STRIPE",
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent,
    stripeEventId: event.id, // For idempotency check
    gatewayResponse: event, // Store full event for debugging
  });

  return {
    message: "Checkout session completed, awaiting payment confirmation",
    bookingIntentId,
  };
};

/**
 * Handle payment_intent.succeeded event
 *
 * CRITICAL: THIS IS WHERE BOOKING IS CONFIRMED
 *
 * WHEN this fires:
 * - Payment is confirmed and captured
 * - Money will be transferred to your account
 *
 * WHAT we do:
 * 1. Find BookingIntent by stripePaymentIntentId
 * 2. Verify intent is valid (not expired, not already confirmed)
 * 3. Call booking.service.createBooking() → SINGLE SOURCE OF TRUTH
 * 4. Update Payment record to SUCCEEDED
 * 5. Mark BookingIntent as CONFIRMED
 *
 * WHY this approach:
 * - booking.service.createBooking() owns ALL slot logic
 * - Never bypass atomic slot increment
 * - If slot becomes full, booking fails but payment succeeded
 *   (requires manual refund - better than overbooking)
 *
 * @param {Object} event - Stripe event object
 * @returns {Object} Processing result
 */
const handlePaymentIntentSucceeded = async (event) => {
  const paymentIntent = event.data.object;

  // Step 1: Find BookingIntent by stripePaymentIntentId
  const intent = await BookingIntent.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (!intent) {
    console.error(
      `BookingIntent not found for payment intent ${paymentIntent.id}`
    );
    return { error: "BookingIntent not found" };
  }

  // Step 2: Check if already confirmed (idempotency)
  if (intent.status === "CONFIRMED") {
    console.log(`BookingIntent ${intent._id} already confirmed, skipping`);
    return {
      message: "Booking already confirmed",
      bookingIntentId: intent._id,
    };
  }

  // Step 3: Verify intent hasn't expired
  // WHY check: Prevent confirming stale intents
  if (intent.expiresAt <= new Date()) {
    // Update payment record to indicate issue
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      {
        status: "SUCCEEDED",
        notes:
          "Payment succeeded but BookingIntent expired - requires manual refund",
      }
    );

    throw new ApiError(
      500,
      "Payment succeeded but BookingIntent expired. Manual refund required."
    );
  }

  try {
    // Step 4: Create booking via booking.service.js
    // CRITICAL: SINGLE SOURCE OF TRUTH for booking logic
    // - Atomic slot increment
    // - Capacity validation
    // - Transactional safety
    const booking = await createBooking(
      intent.userId.toString(),
      intent.slotId.toString(),
      {
        answers: intent.metadata?.answers || {},
        notes: intent.metadata?.notes || "",
      }
    );

    // Step 5: Update Payment record to SUCCEEDED
    await Payment.findOneAndUpdate(
      { bookingIntentId: intent._id },
      {
        status: "SUCCEEDED",
        bookingId: booking._id, // Link payment to booking
        stripePaymentIntentId: paymentIntent.id,
        stripeEventId: event.id,
        gatewayResponse: event,
      },
      { upsert: true } // Create if doesn't exist (shouldn't happen)
    );

    // Step 6: Mark BookingIntent as CONFIRMED
    intent.status = "CONFIRMED";
    await intent.save();

    return {
      message: "Booking confirmed successfully",
      bookingIntentId: intent._id,
      bookingId: booking._id,
    };
  } catch (bookingError) {
    // CRITICAL ERROR: Payment succeeded but booking failed
    // WHY this happens:
    // - Slot became full between payment and booking (rare race condition)
    // - Slot was deleted/blocked
    // - Database error
    //
    // WHAT we do:
    // - Mark payment as SUCCEEDED (money was received)
    // - Keep BookingIntent in PAYMENT_PENDING (not confirmed)
    // - Add error notes for admin
    // - Admin must manually refund payment
    console.error("Booking creation failed after payment:", bookingError);

    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      {
        status: "SUCCEEDED",
        notes: `Payment succeeded but booking failed: ${bookingError.message}. Requires manual refund.`,
        gatewayResponse: event,
      }
    );

    // Don't mark intent as EXPIRED - keep PAYMENT_PENDING for manual intervention
    throw new ApiError(
      500,
      `Payment succeeded but booking failed: ${bookingError.message}. Support team notified.`
    );
  }
};

/**
 * Handle payment_intent.payment_failed event
 *
 * WHEN this fires:
 * - Payment declined (insufficient funds, card declined, etc.)
 * - Payment failed due to technical issues
 *
 * WHAT we do:
 * 1. Find BookingIntent
 * 2. Mark intent as EXPIRED (payment failed = no booking)
 * 3. Update/create Payment record with FAILED status
 * 4. Slot hold released automatically (cleanup job handles expired intents)
 *
 * WHY mark as EXPIRED:
 * - Intent is no longer valid
 * - User must create new intent to retry
 * - Clear state transition
 *
 * @param {Object} event - Stripe event object
 * @returns {Object} Processing result
 */
const handlePaymentIntentFailed = async (event) => {
  const paymentIntent = event.data.object;

  // Step 1: Find BookingIntent
  const intent = await BookingIntent.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (!intent) {
    console.error(
      `BookingIntent not found for failed payment ${paymentIntent.id}`
    );
    return { error: "BookingIntent not found" };
  }

  // Step 2: Mark intent as EXPIRED
  // WHY EXPIRED (not CANCELLED): Payment was attempted and failed
  intent.status = "EXPIRED";
  await intent.save();

  // Step 3: Update or create Payment record
  await Payment.findOneAndUpdate(
    { bookingIntentId: intent._id },
    {
      status: "FAILED",
      stripePaymentIntentId: paymentIntent.id,
      stripeEventId: event.id,
      notes: `Payment failed: ${
        paymentIntent.last_payment_error?.message || "Unknown error"
      }`,
      gatewayResponse: event,
    },
    { upsert: true }
  );

  return {
    message: "Payment failed, BookingIntent expired",
    bookingIntentId: intent._id,
    reason: paymentIntent.last_payment_error?.message || "Unknown error",
  };
};

/**
 * Get Stripe Checkout Session status
 *
 * WHY this function:
 * - Frontend can poll session status
 * - Verify payment without webhook
 * - Customer support can check status
 *
 * @param {String} sessionId - Stripe Checkout Session ID
 * @returns {Object} Session status details
 */
export const getStripeSessionStatus = async (sessionId) => {
  if (!stripe) {
    throw new ApiError(500, "Stripe is not configured");
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      status: session.status, // "open", "complete", "expired"
      paymentStatus: session.payment_status, // "paid", "unpaid", "no_payment_required"
      amountTotal: session.amount_total / 100, // Convert cents to dollars
      currency: session.currency,
      paymentIntent: session.payment_intent,
    };
  } catch (stripeError) {
    throw new ApiError(
      500,
      `Failed to retrieve session: ${stripeError.message}`
    );
  }
};

/**
 * Get payment status for BookingIntent
 *
 * WHY this function:
 * - Show payment details to user
 * - Admin can track payment history
 * - Debugging and support
 *
 * @param {String} bookingIntentId - MongoDB ObjectId as string
 * @returns {Object} Payment status details
 */
export const getPaymentStatus = async (bookingIntentId) => {
  const intent = await BookingIntent.findById(bookingIntentId);
  if (!intent) {
    throw new ApiError(404, "BookingIntent not found");
  }

  const payment = await Payment.findOne({ bookingIntentId });

  return {
    intentStatus: intent.status,
    paymentStatus: payment?.status || "NO_PAYMENT",
    amount: intent.amount,
    currency: intent.currency,
    stripeSessionId: intent.stripeSessionId,
    stripePaymentIntentId: intent.stripePaymentIntentId,
    paymentMethod: payment?.paymentMethod,
    paymentGateway: payment?.paymentGateway,
    expiresAt: intent.expiresAt,
    isExpired: intent.expiresAt <= new Date(),
  };
};

export default {
  createBookingIntent,
  confirmBookingIntent,
  cancelBookingIntent,
  expireBookingIntent,
  getUserIntents,
  processPaymentWebhook,
  // Stripe-specific exports
  createStripeCheckoutSession,
  handleStripeWebhook,
  getStripeSessionStatus,
  getPaymentStatus,
};
