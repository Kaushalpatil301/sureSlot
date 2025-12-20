import mongoose, { Schema } from "mongoose";

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
      index: true, 

    },
    expiresAt: {
      type: Date,
      required: true,
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
    paymentIntentId: {
      type: String,

    },
    amount: {
      type: Number,
      required: true,
      min: 0,

    },
    currency: {
      type: String,
      default: "USD",

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

bookingIntentSchema.index(
  { userId: 1, slotId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },

  }
);

bookingIntentSchema.index({ status: 1, expiresAt: 1 });

bookingIntentSchema.virtual("isExpired").get(function () {
  return this.expiresAt <= new Date();
});

bookingIntentSchema.virtual("isActive").get(function () {
  return this.status === "PENDING" && this.expiresAt > new Date();
});

bookingIntentSchema.methods.getRemainingTime = function () {
  if (this.status !== "PENDING") return 0;

  const remaining = Math.max(0, this.expiresAt - new Date());
  return Math.floor(remaining / 1000); 
};

bookingIntentSchema.statics.findActiveIntent = async function (userId, slotId) {
  return await this.findOne({
    userId,
    slotId,
    status: "PENDING",
    expiresAt: { $gt: new Date() }, 
  });
};

bookingIntentSchema.statics.findExpiredIntents = async function (limit = 100) {
  return await this.find({
    status: "PENDING",
    expiresAt: { $lte: new Date() },
  }).limit(limit);
};

bookingIntentSchema.set("toJSON", { virtuals: true });
bookingIntentSchema.set("toObject", { virtuals: true });

export const BookingIntent = mongoose.model(
  "BookingIntent",
  bookingIntentSchema
);
