import mongoose, { Schema } from "mongoose";

/**
 * Booking Model - Represents a confirmed or pending booking
 *
 * WHY bookings exist separately from slots:
 * - Slots are inventory (one slot, many potential bookings)
 * - Bookings are the relationship between user and slot
 * - Allows tracking booking history even after cancellation
 * - Enables user-specific booking queries
 *
 * INVARIANTS (must always be true):
 * 1. Sum of CONFIRMED bookings for a slot <= slot.capacity
 * 2. One user cannot book the same slot twice (enforced by unique index)
 * 3. Bookings are never deleted (soft delete via CANCELLED status)
 * 4. slot.bookedCount must equal count of CONFIRMED bookings for that slot
 */
const bookingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Indexed for "my bookings" queries
    },
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "Slot",
      required: true,
      index: true, // Indexed for slot-specific queries
    },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "PENDING",
      // WHY three statuses:
      // - PENDING: Payment processing or awaiting confirmation
      // - CONFIRMED: Successfully booked and slot is held
      // - CANCELLED: User cancelled, slot released
    },
    answers: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
      // WHY Map for answers:
      // - Stores booking question responses as key-value pairs
      // - Key = question text or ID
      // - Value = user's answer (can be string, number, etc.)
      // - Flexible schema allows different questions per appointment type
      // - Example: { "Phone Number": "+1234567890", "Allergies": "None" }
    },
    notes: {
      type: String,
      // WHY notes field:
      // - User-provided additional information
      // - Not tied to specific questions
      // - Provider can add internal notes after booking
    },
    // WHY no deletion:
    // - Preserves audit trail
    // - Enables analytics (cancellation rates, popular times)
    // - Prevents foreign key issues if referenced elsewhere
    // - Can restore if needed
  },
  {
    timestamps: true,
    // WHY timestamps:
    // - Track when booking was created (createdAt)
    // - Track last status change (updatedAt)
    // - Useful for "booked on" display
    // - Required for refund policies based on booking time
  }
);

// Compound index to enforce business rule: one user cannot book same slot twice
// WHY unique compound index:
// - Prevents duplicate bookings at database level
// - Atomic constraint (no race condition)
// - Fails fast if user tries to book same slot again
// - Works across transaction boundaries
bookingSchema.index({ userId: 1, slotId: 1 }, { unique: true });

// Index for user's booking history queries
// WHY separate index:
// - "My bookings" is a common query
// - Filter by status for active bookings
// - Sort by createdAt for chronological display
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Index for slot's booking list
// WHY this index:
// - Need to count CONFIRMED bookings per slot
// - Verify slot.bookedCount integrity
// - Useful for admin views
bookingSchema.index({ slotId: 1, status: 1 });

// Virtual field to check if booking is active
bookingSchema.virtual("isActive").get(function () {
  return this.status === "CONFIRMED" || this.status === "PENDING";
});

// Virtual field to check if booking can be cancelled
// WHY in model:
// - Centralized cancellation policy
// - Can be extended with time-based rules
// - Used before attempting cancellation
bookingSchema.virtual("canBeCancelled").get(function () {
  return this.status === "CONFIRMED" || this.status === "PENDING";
});

// Method to check if booking is in a final state
// WHY final state matters:
// - CANCELLED is irreversible
// - CONFIRMED can become CANCELLED
// - PENDING can become CONFIRMED or CANCELLED
bookingSchema.methods.isFinalState = function () {
  return this.status === "CANCELLED";
};

// Static method to count confirmed bookings for a slot
// WHY static method:
// - Common verification query
// - Used to check slot.bookedCount integrity
// - Encapsulates query logic
bookingSchema.statics.countConfirmedBookingsForSlot = async function (slotId) {
  return await this.countDocuments({
    slotId,
    status: "CONFIRMED",
  });
};

// Static method to get user's active bookings
// WHY static method:
// - Common query pattern
// - Reusable across services
// - Single source of truth
bookingSchema.statics.getUserActiveBookings = async function (userId) {
  return await this.find({
    userId,
    status: { $in: ["PENDING", "CONFIRMED"] },
  })
    .populate("slotId")
    .sort({ createdAt: -1 });
};

// Ensure virtuals are included in JSON responses
bookingSchema.set("toJSON", { virtuals: true });
bookingSchema.set("toObject", { virtuals: true });

export const Booking = mongoose.model("Booking", bookingSchema);
