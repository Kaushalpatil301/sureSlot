import mongoose, { Schema } from "mongoose";

const paymentSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      index: true,

    },
    bookingIntentId: {
      type: Schema.Types.ObjectId,
      ref: "BookingIntent",
      required: true,
      index: true,

    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,

    },
    amount: {
      type: Number,
      required: true,
      min: 0,

    },
    currency: {
      type: String,
      required: true,
      default: "USD",

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

    },
    paymentMethod: {
      type: String,
      enum: ["CARD", "UPI", "WALLET", "NET_BANKING", "PAY_LATER", "FREE"],

    },
    paymentGateway: {
      type: String,
      enum: ["STRIPE", "RAZORPAY", "PAYPAL", "MANUAL", "NONE"],
      default: "STRIPE",

    },
    gatewayPaymentId: {
      type: String,
      index: true,

    },
    
    stripeSessionId: {
      type: String,
      index: true,

    },
    stripePaymentIntentId: {
      type: String,
      index: true,

    },
    stripeEventId: {
      type: String,
      unique: true,
      sparse: true,

    },
    gatewayResponse: {
      type: Schema.Types.Mixed,

    },
    failureReason: {
      type: String,

    },
    notes: {
      type: String,

    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,

    },
    refundReason: {
      type: String,

    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,

    },
  },
  {
    timestamps: true,

  }
);

paymentSchema.index({ userId: 1, createdAt: -1 });

paymentSchema.index({ bookingId: 1 });

paymentSchema.index({ gatewayPaymentId: 1, paymentGateway: 1 });

paymentSchema.index({ status: 1, paymentMethod: 1 });

paymentSchema.virtual("isSuccessful").get(function () {
  return this.status === "SUCCEEDED";
});

paymentSchema.virtual("canRefund").get(function () {
  return (
    this.status === "SUCCEEDED" && this.refundAmount < this.amount 
  );
});

paymentSchema.methods.getRefundableAmount = function () {
  if (this.status !== "SUCCEEDED") return 0;
  return this.amount - this.refundAmount;
};

paymentSchema.statics.findByGatewayId = async function (
  gatewayPaymentId,
  paymentGateway
) {
  return await this.findOne({
    gatewayPaymentId,
    paymentGateway,
  });
};

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

paymentSchema.set("toJSON", { virtuals: true });
paymentSchema.set("toObject", { virtuals: true });

export const Payment = mongoose.model("Payment", paymentSchema);
