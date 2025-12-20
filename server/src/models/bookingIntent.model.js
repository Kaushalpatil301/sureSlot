import mongoose, { Schema } from "mongoose";

/**
 * BookingIntent Model - Temporary reservation during payment flow
 *
 * WHY BOOKING INTENTS MODEL REAL-WORLD PAYMENT BEHAVIOR:
 *
 * 1. USER EXPERIENCE:
 *    - User selects slot, starts payment process
 *    - Payment takes time (redirect to payment gateway, OTP, etc.)
 *    - During this time, slot should be "held" for this user
 *    - Prevents others from booking while user is paying
 *
 * 2. INVENTORY PROTECTION:
 *    - Without intents: Users can lose slots while entering card details
 *    - With intents: Temporary hold ensures slot stays available
 *    - Fairness: First to initiate payment gets priority
 *    - Prevents "abandoned cart" overbooking
 *
 * 3. TIMEOUT HANDLING:
 *    - User might abandon payment (close browser, timeout, etc.)
 *    - Intent expires after N minutes (configurable)
 *    - Slot is automatically released back to inventory
 *    - No manual intervention needed
 *
 * 4. SEPARATION OF CONCERNS:
 *    - Intent = "I want to book this" (payment in progress)
 *    - Booking = "I have booked this" (payment confirmed)
 *    - Clear lifecycle: Intent → Payment → Booking
 *    - Can track conversion rates and abandoned intents
 *
 * 5. PAYMENT GATEWAY INTEGRATION:
 *    - Real payment gateways (Stripe, Razorpay) work asynchronously
 *    - Intent stores payment session ID
 *    - Webhook confirms payment later
 *    - Intent bridges the async gap
 */

const bookingIntentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "Slot",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "PAYMENT_PENDING", "CONFIRMED", "EXPIRED", "CANCELLED"],
      default: "PENDING",
      index: true, // Indexed for status-based queries
      // WHY these statuses:
      // - PENDING: Intent created, awaiting payment initiation
      // - PAYMENT_PENDING: Stripe checkout session created, awaiting payment
      // - CONFIRMED: Payment successful, converted to booking
      // - EXPIRED: Timeout reached, slot released
      // - CANCELLED: User cancelled before payment
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true, // Indexed for cleanup job queries
      // WHY expiry:
      // - Prevents indefinite slot holds
      // - Typical: 10-15 minutes (payment completion time)
      // - After expiry, slot returns to inventory
      // - Background job cleans up expired intents
    },
    // Stripe integration fields
    stripeSessionId: {
      type: String,
      index: true,
      // WHY store Stripe Checkout Session ID:
      // - Links intent to Stripe Checkout Session
      // - Used to retrieve session status
      // - Enables session expiry tracking
      // - Null if not using Stripe Checkout
    },
    stripePaymentIntentId: {
      type: String,
      index: true,
      // WHY store Stripe Payment Intent ID:
      // - Unique identifier for payment in Stripe
      // - Used in webhook events (payment_intent.succeeded)
      // - Enables payment status queries
      // - Links to Payment model for audit trail
      // - Null if free appointment or other gateway
    },
    paymentIntentId: {
      type: String,
      // WHY keep generic paymentIntentId:
      // - Backwards compatibility with other gateways
      // - Can store Razorpay, PayPal IDs here
      // - Null if free appointment or pay-later
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      // WHY store amount:
      // - Audit trail for pricing
      // - Prevents price manipulation
      // - Required for refunds
      // - Can differ from current price (promotional rates)
    },
    currency: {
      type: String,
      default: "USD",
      // WHY store currency:
      // - Multi-currency support
      // - Required for international bookings
      // - Payment gateway needs it
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      // WHY metadata:
      // - Store additional booking context (notes, preferences)
      // - Custom fields without schema changes
      // - Can include promotional codes, referral info
      // - Flexible for future requirements
    },
  },
  {
    timestamps: true,
    // WHY timestamps:
    // - Track when intent was created (createdAt)
    // - Monitor payment completion time
    // - Analytics: average time to payment
  }
);

// Compound index for user + slot + status
// WHY this index:
// - Prevents duplicate active intents for same user+slot
// - Enables efficient queries: "does user have pending intent for this slot?"
// - Partial unique index (only on PENDING status)
bookingIntentSchema.index(
  { userId: 1, slotId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
    // WHY partial unique:
    // - User can only have ONE pending intent per slot
    // - But can have multiple expired/cancelled intents (history)
    // - Prevents duplicate payment attempts
  }
);

// Index for cleanup job
// WHY this index:
// - Background job queries: { status: PENDING, expiresAt: { $lt: now } }
// - Compound index serves this query efficiently
// - Critical for job performance
bookingIntentSchema.index({ status: 1, expiresAt: 1 });

// Virtual to check if intent is expired
bookingIntentSchema.virtual("isExpired").get(function () {
  return this.expiresAt <= new Date();
});

// Virtual to check if intent is still valid
bookingIntentSchema.virtual("isActive").get(function () {
  return this.status === "PENDING" && this.expiresAt > new Date();
});

// Method to calculate remaining time
// WHY method:
// - Used by frontend to show countdown timer
// - Helps user understand urgency
// - Returns seconds remaining
bookingIntentSchema.methods.getRemainingTime = function () {
  if (this.status !== "PENDING") return 0;

  const remaining = Math.max(0, this.expiresAt - new Date());
  return Math.floor(remaining / 1000); // Convert to seconds
};

// Static method to find active intent for user+slot
// WHY static method:
// - Common query pattern
// - Used before creating new intent (check existing)
// - Encapsulates query logic
bookingIntentSchema.statics.findActiveIntent = async function (userId, slotId) {
  return await this.findOne({
    userId,
    slotId,
    status: "PENDING",
    expiresAt: { $gt: new Date() }, // Not expired
  });
};

// Static method to find expired intents for cleanup
// WHY static method:
// - Used by background job
// - Encapsulates cleanup logic
// - Returns batch of expired intents
bookingIntentSchema.statics.findExpiredIntents = async function (limit = 100) {
  return await this.find({
    status: "PENDING",
    expiresAt: { $lte: new Date() },
  }).limit(limit);
};

// Ensure virtuals are included in JSON responses
bookingIntentSchema.set("toJSON", { virtuals: true });
bookingIntentSchema.set("toObject", { virtuals: true });

export const BookingIntent = mongoose.model(
  "BookingIntent",
  bookingIntentSchema
);
