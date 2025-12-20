import mongoose, { Schema } from "mongoose";

const slotSchema = new Schema(
  {
    appointmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: "AppointmentType",
      required: true,
      index: true, 
    },
    startTime: {
      type: Date,
      required: true,
      index: true, 
    },
    endTime: {
      type: Date,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
      default: 1, 
      min: 1,
    },
    bookedCount: {
      type: Number,
      default: 0,
      min: 0,

    },
    status: {
      type: String,
      enum: ["AVAILABLE", "BLOCKED"],
      default: "AVAILABLE",

    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,

    },

  },
  {
    timestamps: true,

  }
);

slotSchema.index({ appointmentTypeId: 1, startTime: 1, status: 1 });

slotSchema.index({ bookedCount: 1, capacity: 1 });

slotSchema.index({ appointmentTypeId: 1, startTime: 1 }, { unique: true });

slotSchema.virtual("isFullyBooked").get(function () {
  return this.bookedCount >= this.capacity;
});

slotSchema.virtual("isAvailable").get(function () {
  return (
    this.status === "AVAILABLE" &&
    this.bookedCount < this.capacity &&
    this.startTime > new Date() 
  );
});

slotSchema.methods.canBook = function () {
  return (
    this.status === "AVAILABLE" &&
    this.bookedCount < this.capacity &&
    this.startTime > new Date()
  );
};

slotSchema.statics.findAvailableSlots = function (
  appointmentTypeId,
  startDate,
  endDate
) {
  return this.find({
    appointmentTypeId,
    startTime: { $gte: startDate, $lte: endDate },
    status: "AVAILABLE",
    $expr: { $lt: ["$bookedCount", "$capacity"] }, 
  }).sort({ startTime: 1 });
};

slotSchema.set("toJSON", { virtuals: true });
slotSchema.set("toObject", { virtuals: true });

export const Slot = mongoose.model("Slot", slotSchema);
