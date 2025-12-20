import mongoose, { Schema } from "mongoose";

/**
 * Payment Model - Records all payment transactions
 *
 * WHY separate payment model:
 * - Bookings track appointments, payments track money
 * - One booking can have multiple payment attempts (failed, refunded, etc.)
 * - Enables financial audit trail
 * - Supports refunds, disputes, reconciliation
 * - Required for accounting and compliance
 */

const paymentSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
      // WHY bookingId:
      // - Links payment to specific booking
      // - One booking may have multiple payments (refunds)
      // - Null for failed payments that never created booking
    },
    bookingIntentId: {
      type: Schema.Types.ObjectId,
      ref: "BookingIntent",
      required: true,
      index: true,
      // WHY bookingIntentId:
      // - Every payment starts with an intent
      // - Links payment to reservation attempt
      // - Required even if payment fails
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      // WHY userId:
      // - Track who made payment
      // - User's payment history
      // - Required for refunds
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      // WHY amount:
      // - Exact amount charged
      // - Must match intent amount (or explain difference)
      // - Required for financial records
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
      // WHY currency:
      // - Multi-currency support
      // - Required for international transactions
      // - Exchange rate tracking
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "SUCCEEDED",
        "FAILED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      default: "PENDING",
      index: true,
      // WHY these statuses:
      // - PENDING: Payment initiated, awaiting gateway
      // - PROCESSING: Gateway is processing
      // - SUCCEEDED: Payment confirmed
      // - FAILED: Payment rejected (card declined, etc.)
      // - REFUNDED: Full refund issued
      // - PARTIALLY_REFUNDED: Partial refund (cancellation fees)
    },
    paymentMethod: {
      type: String,
      enum: ["CARD", "UPI", "WALLET", "NET_BANKING", "PAY_LATER", "FREE"],
      // WHY track payment method:
      // - Analytics: which methods are popular
      // - Refund routing (same method used)
      // - Transaction fees vary by method
      // - User preferences for future bookings
    },
    paymentGateway: {
      type: String,
      enum: ["STRIPE", "RAZORPAY", "PAYPAL", "MANUAL", "NONE"],
      default: "STRIPE",
      // WHY track gateway:
      // - Different gateways for different regions
      // - Gateway-specific reconciliation
      // - Fallback if one gateway is down
    },
    gatewayPaymentId: {
      type: String,
      index: true,
      // WHY gateway payment ID:
      // - Reference to transaction in payment gateway
      // - Used for refunds, disputes
      // - Webhook verification
      // - Critical for reconciliation
    },
    // Stripe-specific fields
    stripeSessionId: {
      type: String,
      index: true,
      // WHY store Stripe Checkout Session ID:
      // - Links payment to Stripe Checkout Session
      // - Used to retrieve session details
      // - Debugging and customer support
      // - Null if not using Stripe Checkout
    },
    stripePaymentIntentId: {
      type: String,
      index: true,
      // WHY store Stripe Payment Intent ID:
      // - Unique identifier for payment in Stripe
      // - Used in webhook events
      // - Required for refunds and disputes
      // - Links to Stripe dashboard
      // - Null if not using Stripe
    },
    stripeEventId: {
      type: String,
      unique: true,
      sparse: true,
      // WHY store Stripe Event ID:
      // - Ensures idempotency (prevent duplicate webhook processing)
      // - Stripe may send same event multiple times
      // - Unique constraint prevents duplicate payment records
      // - Sparse index allows null values
      // - Critical for webhook reliability
    },
    gatewayResponse: {
      type: Schema.Types.Mixed,
      // WHY store gateway response:
      // - Debug failed payments
      // - Audit trail
      // - Dispute resolution
      // - Contains gateway-specific metadata
      // - Full Stripe event for Stripe payments
    },
    failureReason: {
      type: String,
      // WHY failure reason:
      // - User feedback on why payment failed
      // - Analytics: common failure reasons
      // - Improve success rates
      // - Examples: "insufficient_funds", "card_declined"
    },
    notes: {
      type: String,
      // WHY notes field:
      // - Admin notes for payment issues
      // - Manual intervention details
      // - "Payment succeeded but booking failed - requires manual refund"
      // - Customer support context
      // - Debugging information
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
      // WHY refund amount:
      // - Track partial refunds
      // - Cancellation fees deducted from refund
      // - Must be <= original amount
    },
    refundReason: {
      type: String,
      // WHY refund reason:
      // - User cancellation, service issue, etc.
      // - Analytics: why bookings are cancelled
      // - Dispute resolution
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      // WHY metadata:
      // - Promotional codes applied
      // - Discount details
      // - Custom fields
      // - Gateway-specific data
    },
  },
  {
    timestamps: true,
    // WHY timestamps:
    // - Track payment time
    // - Required for financial reporting
    // - Refund time tracking
    // - SLA monitoring
  }
);

// Index for user's payment history
paymentSchema.index({ userId: 1, createdAt: -1 });

// Index for booking's payment records
paymentSchema.index({ bookingId: 1 });

// Index for gateway reconciliation
// WHY this index:
// - Webhook lookups by gateway ID
// - Must be fast (webhook timeouts are strict)
paymentSchema.index({ gatewayPaymentId: 1, paymentGateway: 1 });

// Index for failed payment analysis
paymentSchema.index({ status: 1, paymentMethod: 1 });

// Virtual to check if payment is successful
paymentSchema.virtual("isSuccessful").get(function () {
  return this.status === "SUCCEEDED";
});

// Virtual to check if payment can be refunded
paymentSchema.virtual("canRefund").get(function () {
  return (
    this.status === "SUCCEEDED" && this.refundAmount < this.amount // Not fully refunded
  );
});

// Method to calculate refundable amount
// WHY method:
// - Business logic for partial refunds
// - Accounts for already refunded amount
// - Used before issuing refund
paymentSchema.methods.getRefundableAmount = function () {
  if (this.status !== "SUCCEEDED") return 0;
  return this.amount - this.refundAmount;
};

// Static method to find payment by gateway ID
// WHY static method:
// - Used by webhooks
// - Common query pattern
// - Fast lookup for confirmation
paymentSchema.statics.findByGatewayId = async function (
  gatewayPaymentId,
  paymentGateway
) {
  return await this.findOne({
    gatewayPaymentId,
    paymentGateway,
  });
};

// Static method to calculate revenue
// WHY static method:
// - Business analytics
// - Revenue reporting
// - Aggregates successful payments
paymentSchema.statics.calculateRevenue = async function (startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        status: "SUCCEEDED",
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        totalRefunded: { $sum: "$refundAmount" },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      totalRevenue: 0,
      totalRefunded: 0,
      netRevenue: 0,
      transactionCount: 0,
    };
  }

  const data = result[0];
  return {
    totalRevenue: data.totalRevenue,
    totalRefunded: data.totalRefunded,
    netRevenue: data.totalRevenue - data.totalRefunded,
    transactionCount: data.transactionCount,
  };
};

// Ensure virtuals are included in JSON responses
paymentSchema.set("toJSON", { virtuals: true });
paymentSchema.set("toObject", { virtuals: true });

export const Payment = mongoose.model("Payment", paymentSchema);
