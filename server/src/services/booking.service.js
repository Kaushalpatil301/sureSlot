import { Booking } from "../models/booking.model.js";
import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

/**
 * Booking Service - Transactional booking operations
 *
 * WHY transactions are critical:
 *
 * ATOMICITY:
 * - Either ALL operations succeed or ALL operations fail
 * - No partial state (e.g., booking created but slot not incremented)
 * - Database handles rollback automatically on error
 * - Prevents data inconsistency
 *
 * CONSISTENCY:
 * - Maintains invariant: slot.bookedCount = count of CONFIRMED bookings
 * - Prevents overbooking through conditional updates
 * - All business rules enforced within single transaction
 *
 * ISOLATION:
 * - Concurrent bookings don't interfere with each other
 * - One transaction doesn't see uncommitted changes from another
 * - Prevents race conditions even under high load
 *
 * DURABILITY:
 * - Once transaction commits, changes are permanent
 * - Survives crashes and restarts
 * - No data loss after confirmation
 */

/**
 * Creates a booking with atomic slot increment
 *
 * ATOMICITY GUARANTEE:
 * - Uses MongoDB transaction (all-or-nothing)
 * - Conditionally increments slot.bookedCount ONLY if capacity not exceeded
 * - Creates booking record in same transaction
 * - If ANY step fails, entire operation rolls back
 *
 * RACE CONDITION PREVENTION:
 * - findOneAndUpdate with condition prevents double-booking
 * - Only ONE transaction can increment when capacity-1 slots remain
 * - Database serializes conflicting transactions
 * - Losers get null (slot full) and transaction aborts
 *
 * @param {String} userId - MongoDB ObjectId as string
 * @param {String} slotId - MongoDB ObjectId as string
 * @param {Object} bookingData - Additional booking data (answers, notes)
 * @returns {Object} Created booking
 */
export const createBooking = async (userId, slotId, bookingData = {}) => {
  // Start a MongoDB session for transaction
  // WHY session needed:
  // - Transactions require explicit session
  // - Session tracks all operations in transaction
  // - Provides commit/abort control
  const session = await mongoose.startSession();

  try {
    // Start transaction
    // WHY transaction:
    // - Atomic: both slot update AND booking creation succeed or both fail
    // - Prevents orphaned bookings (booking exists but slot not incremented)
    // - Prevents lost slots (slot incremented but booking failed to create)
    session.startTransaction();

    // Step 1: Atomically increment slot bookedCount (if capacity allows)
    // WHY findOneAndUpdate with conditions:
    // - Atomic operation (no lock needed)
    // - Condition ensures we don't exceed capacity
    // - Returns null if condition fails (slot full)
    // - Prevents race conditions between check and update
    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        status: "AVAILABLE",
        // CRITICAL CONDITION: only increment if bookedCount < capacity
        // This is the key invariant that prevents overbooking
        $expr: { $lt: ["$bookedCount", "$capacity"] },
      },
      {
        $inc: { bookedCount: 1 }, // Atomic increment
      },
      {
        new: true, // Return updated document
        session, // Use transaction session
      }
    );

    // If slot is null, conditions were not met (slot full, blocked, or doesn't exist)
    if (!slot) {
      throw new ApiError(
        409,
        "Slot is not available (fully booked, blocked, or does not exist)"
      );
    }

    // Verify slot is in the future
    // WHY check after slot update:
    // - Prevents booking past slots
    // - Slot update succeeded, but we still validate business rules
    // - If fails, transaction aborts and slot increment is rolled back
    if (slot.startTime <= new Date()) {
      throw new ApiError(400, "Cannot book a slot in the past");
    }

    // Step 2: Create booking record in same transaction
    // WHY create in transaction:
    // - If this fails, slot increment is rolled back
    // - Maintains invariant: bookedCount matches booking records
    // - Atomic coupling of inventory and booking
    const booking = await Booking.create(
      [
        {
          userId,
          slotId,
          status: "CONFIRMED", // Directly confirmed (can be PENDING if payment flow exists)
          answers: bookingData.answers || {},
          notes: bookingData.notes || "",
        },
      ],
      { session } // CRITICAL: must pass session for transaction
    );

    // Commit transaction
    // WHY explicit commit:
    // - Makes all changes permanent
    // - After commit, other transactions can see changes
    // - If commit fails, everything rolls back automatically
    await session.commitTransaction();

    // Populate slot details for response
    const createdBooking = await Booking.findById(booking[0]._id)
      .populate("slotId")
      .populate("userId", "username email fullname");

    return createdBooking;
  } catch (error) {
    // Abort transaction on any error
    // WHY abort:
    // - Rolls back all changes made in transaction
    // - Slot increment is undone
    // - Booking creation is undone
    // - Database returns to state before transaction started
    await session.abortTransaction();

    // Re-throw error for controller to handle
    if (error instanceof ApiError) throw error;

    // Handle duplicate booking (unique index violation)
    if (error.code === 11000) {
      throw new ApiError(409, "You have already booked this slot");
    }

    throw new ApiError(500, `Booking creation failed: ${error.message}`);
  } finally {
    // Always end session
    // WHY finally:
    // - Releases database resources
    // - Happens whether transaction succeeded or failed
    // - Prevents session leaks
    session.endSession();
  }
};

/**
 * Cancels a booking and releases the slot
 *
 * ATOMICITY GUARANTEE:
 * - Marks booking as CANCELLED
 * - Decrements slot.bookedCount
 * - Both happen in single transaction
 *
 * @param {String} bookingId - MongoDB ObjectId as string
 * @param {String} userId - MongoDB ObjectId as string (for authorization)
 * @returns {Object} Cancelled booking
 */
export const cancelBooking = async (bookingId, userId) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Step 1: Find and validate booking
    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    // Verify ownership
    // WHY check ownership:
    // - User can only cancel their own bookings
    // - Security: prevents cancelling other users' bookings
    if (booking.userId.toString() !== userId.toString()) {
      throw new ApiError(403, "You are not authorized to cancel this booking");
    }

    // Check if booking can be cancelled
    if (!booking.canBeCancelled) {
      throw new ApiError(
        400,
        "Booking cannot be cancelled (already cancelled)"
      );
    }

    // Step 2: Mark booking as cancelled
    // WHY not delete:
    // - Preserves history for analytics
    // - Allows refund processing
    // - Maintains referential integrity
    // - Can restore if needed
    booking.status = "CANCELLED";
    await booking.save({ session });

    // Step 3: Atomically decrement slot bookedCount
    // WHY conditional decrement:
    // - Prevents negative bookedCount
    // - Maintains invariant: bookedCount >= 0
    // - Fails if slot already at zero (data inconsistency)
    const slot = await Slot.findOneAndUpdate(
      {
        _id: booking.slotId,
        bookedCount: { $gt: 0 }, // Only decrement if > 0
      },
      {
        $inc: { bookedCount: -1 }, // Atomic decrement
      },
      {
        new: true,
        session,
      }
    );

    if (!slot) {
      throw new ApiError(
        500,
        "Failed to release slot (data inconsistency detected)"
      );
    }

    // Commit transaction
    await session.commitTransaction();

    // Return updated booking with slot details
    const cancelledBooking = await Booking.findById(bookingId)
      .populate("slotId")
      .populate("userId", "username email fullname");

    return cancelledBooking;
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Booking cancellation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

/**
 * Gets user's bookings (with optional status filter)
 *
 * WHY separate read function:
 * - No transaction needed for reads
 * - Controller doesn't access model directly
 * - Consistent query logic
 *
 * @param {String} userId - MongoDB ObjectId as string
 * @param {String} status - Optional status filter (PENDING, CONFIRMED, CANCELLED)
 * @returns {Array} User's bookings
 */
export const getUserBookings = async (userId, status = null) => {
  try {
    const filter = { userId };

    if (status) {
      // Validate status
      if (!["PENDING", "CONFIRMED", "CANCELLED"].includes(status)) {
        throw new ApiError(
          400,
          "Invalid status. Use PENDING, CONFIRMED, or CANCELLED"
        );
      }
      filter.status = status;
    }

    const bookings = await Booking.find(filter)
      .populate("slotId")
      .sort({ createdAt: -1 }); // Most recent first

    return bookings;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch bookings: ${error.message}`);
  }
};

/**
 * Gets a single booking by ID
 *
 * @param {String} bookingId - MongoDB ObjectId as string
 * @param {String} userId - MongoDB ObjectId as string (for authorization)
 * @returns {Object} Booking details
 */
export const getBookingById = async (bookingId, userId) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate("slotId")
      .populate("userId", "username email fullname");

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    // Verify ownership
    if (booking.userId._id.toString() !== userId.toString()) {
      throw new ApiError(403, "You are not authorized to view this booking");
    }

    return booking;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch booking: ${error.message}`);
  }
};

/**
 * Verifies booking data integrity (admin/debug function)
 *
 * WHY integrity check:
 * - Ensures invariants are maintained
 * - Detects data corruption
 * - Useful for debugging and monitoring
 *
 * @param {String} slotId - MongoDB ObjectId as string
 * @returns {Object} Integrity report
 */
export const verifySlotBookingIntegrity = async (slotId) => {
  try {
    // Get slot
    const slot = await Slot.findById(slotId);
    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    // Count confirmed bookings
    const confirmedCount = await Booking.countConfirmedBookingsForSlot(slotId);

    // Check invariant: slot.bookedCount should equal confirmed bookings
    const isValid = slot.bookedCount === confirmedCount;

    return {
      slotId,
      slotBookedCount: slot.bookedCount,
      actualConfirmedBookings: confirmedCount,
      isValid,
      discrepancy: isValid ? 0 : Math.abs(slot.bookedCount - confirmedCount),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Integrity check failed: ${error.message}`);
  }
};

export default {
  createBooking,
  cancelBooking,
  getUserBookings,
  getBookingById,
  verifySlotBookingIntegrity,
};
