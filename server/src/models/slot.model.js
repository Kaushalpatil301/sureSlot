import mongoose, { Schema } from "mongoose";

/**
 * Slot Model - Represents finite inventory for appointments
 *
 * WHY this design:
 * - Slots are pre-generated inventory (not created on-demand)
 * - Pre-generation prevents race conditions during concurrent bookings
 * - Atomic updates on bookedCount ensure no overbooking
 * - Status field allows blocking slots without deletion
 * - Capacity field enables multiple bookings per slot (e.g., group sessions)
 */
const slotSchema = new Schema(
  {
    appointmentTypeId: {
      type: Schema.Types.ObjectId,
      ref: "AppointmentType",
      required: true,
      index: true, // Indexed because queries always filter by appointment type
    },
    startTime: {
      type: Date,
      required: true,
      index: true, // Indexed for date range queries
    },
    endTime: {
      type: Date,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
      default: 1, // Most appointments are 1-on-1
      min: 1,
    },
    bookedCount: {
      type: Number,
      default: 0,
      min: 0,
      // WHY track bookedCount:
      // - Enables atomic increment/decrement operations
      // - Prevents overbooking through conditional updates
      // - Supports multiple bookings per slot (group sessions)
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "BLOCKED"],
      default: "AVAILABLE",
      // WHY BLOCKED status:
      // - Admin can block slots for holidays/breaks without deletion
      // - Preserves slot history and booking references
      // - Can be re-enabled later
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      // WHY optional: Not all appointment types have specific providers
      // Example: "Conference Room" has no provider, "Dr. Smith Consultation" does
      // Used for provider utilization reports and filtering
    },
    // WHY no userId reference for booking:
    // - Slots are shared inventory, not owned by a single user
    // - Multiple bookings can reference the same slot
    // - Booking model maintains the user-slot relationship
  },
  {
    timestamps: true,
    // WHY timestamps:
    // - Track when slots were generated
    // - Useful for cleanup jobs (delete old slots)
    // - Audit trail for debugging
  }
);

// Compound index for efficient queries
// WHY this index:
// - Most queries filter by appointmentTypeId + time range + status
// - Compound index serves all three conditions efficiently
// - Order matters: appointmentTypeId (equality) -> startTime (range) -> status (equality)
slotSchema.index({ appointmentTypeId: 1, startTime: 1, status: 1 });

// Index for finding available slots
// WHY this index:
// - Common query: find slots that aren't fully booked
// - Enables efficient filtering without full collection scan
slotSchema.index({ bookedCount: 1, capacity: 1 });

// Unique index to prevent duplicate slots
// WHY this constraint:
// - Prevents generating the same slot twice
// - Makes slot generation idempotent
// - Two slots with same appointmentTypeId + startTime is invalid
slotSchema.index({ appointmentTypeId: 1, startTime: 1 }, { unique: true });

// Virtual field to check if slot is fully booked
slotSchema.virtual("isFullyBooked").get(function () {
  return this.bookedCount >= this.capacity;
});

// Virtual field to check if slot is available for booking
slotSchema.virtual("isAvailable").get(function () {
  return (
    this.status === "AVAILABLE" &&
    this.bookedCount < this.capacity &&
    this.startTime > new Date() // Only future slots are available
  );
});

// Method to check if slot can accept a booking
// WHY separate method:
// - Centralized availability logic
// - Used by services before attempting booking
// - Prevents invalid booking attempts
slotSchema.methods.canBook = function () {
  return (
    this.status === "AVAILABLE" &&
    this.bookedCount < this.capacity &&
    this.startTime > new Date()
  );
};

// Static method to find available slots
// WHY static method:
// - Common query pattern used across services
// - Encapsulates complex availability logic
// - Single source of truth for availability checks
slotSchema.statics.findAvailableSlots = function (
  appointmentTypeId,
  startDate,
  endDate
) {
  return this.find({
    appointmentTypeId,
    startTime: { $gte: startDate, $lte: endDate },
    status: "AVAILABLE",
    $expr: { $lt: ["$bookedCount", "$capacity"] }, // bookedCount < capacity
  }).sort({ startTime: 1 });
};

// Ensure virtuals are included in JSON responses
slotSchema.set("toJSON", { virtuals: true });
slotSchema.set("toObject", { virtuals: true });

export const Slot = mongoose.model("Slot", slotSchema);
