import mongoose, { Schema } from "mongoose";

const bookingSchema = new Schema(
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
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "PENDING",

    },
    answers: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},

    },
    notes: {
      type: String,

    },

  },
  {
    timestamps: true,

  }
);

bookingSchema.index({ userId: 1, slotId: 1 }, { unique: true });

bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

bookingSchema.index({ slotId: 1, status: 1 });

bookingSchema.virtual("isActive").get(function () {
  return this.status === "CONFIRMED" || this.status === "PENDING";
});

bookingSchema.virtual("canBeCancelled").get(function () {
  return this.status === "CONFIRMED" || this.status === "PENDING";
});

bookingSchema.methods.isFinalState = function () {
  return this.status === "CANCELLED";
};

bookingSchema.statics.countConfirmedBookingsForSlot = async function (slotId) {
  return await this.countDocuments({
    slotId,
    status: "CONFIRMED",
  });
};

bookingSchema.statics.getUserActiveBookings = async function (userId) {
  return await this.find({
    userId,
    status: { $in: ["PENDING", "CONFIRMED"] },
  })
    .populate("slotId")
    .sort({ createdAt: -1 });
};

bookingSchema.set("toJSON", { virtuals: true });
bookingSchema.set("toObject", { virtuals: true });

export const Booking = mongoose.model("Booking", bookingSchema);
