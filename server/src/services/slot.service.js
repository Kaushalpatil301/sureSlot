import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  generateSlots,
  validateSlotGenerationParams,
  estimateSlotCount,
  DEFAULT_WORKING_HOURS,
} from "../utils/slot-generator.js";
import mongoose from "mongoose";

/**
 * Slot Service - Business logic for slot inventory management
 *
 * WHY separate service layer:
 * - Controllers stay thin (just request/response handling)
 * - Business logic is reusable across different routes
 * - Easier to test without HTTP layer
 * - Single source of truth for slot operations
 */

/**
 * Generates and persists slots for an appointment type
 *
 * WHY this is idempotent:
 * - Uses insertMany with ordered: false
 * - Duplicate slots (same appointmentTypeId + startTime) are rejected by unique index
 * - Continues inserting other valid slots even if some exist
 * - Safe to call multiple times without creating duplicates
 *
 * @param {Object} appointmentType - The appointment type configuration
 * @param {Date} startDate - Start date for generation
 * @param {Date} endDate - End date for generation
 * @param {Object} workingHours - Working hours config (optional, uses defaults)
 * @returns {Object} Generation result with stats
 */
export const generateAndSaveSlots = async (
  appointmentType,
  startDate,
  endDate,
  workingHours = DEFAULT_WORKING_HOURS
) => {
  try {
    // Validate inputs before expensive operations
    validateSlotGenerationParams(
      appointmentType,
      startDate,
      endDate,
      workingHours
    );

    // Generate slot objects (in-memory, fast)
    const slotsToCreate = generateSlots(
      appointmentType,
      startDate,
      endDate,
      workingHours
    );

    if (slotsToCreate.length === 0) {
      return {
        success: true,
        message:
          "No slots to generate for the given date range and working hours",
        created: 0,
        duplicates: 0,
        total: 0,
      };
    }

    // WHY insertMany with ordered: false:
    // - Ordered: false continues on duplicate key errors
    // - Allows idempotent slot generation
    // - Returns success count even if some slots exist
    // - Much faster than inserting one by one
    let created = 0;
    let duplicates = 0;

    try {
      const result = await Slot.insertMany(slotsToCreate, {
        ordered: false, // Continue on duplicates
      });
      created = result.length;
    } catch (error) {
      // Handle duplicate key errors (expected behavior for idempotency)
      if (error.code === 11000) {
        // Some slots were created, some were duplicates
        created = error.insertedDocs ? error.insertedDocs.length : 0;
        duplicates = slotsToCreate.length - created;
      } else {
        throw error; // Re-throw unexpected errors
      }
    }

    return {
      success: true,
      message: `Slot generation completed`,
      created,
      duplicates,
      total: slotsToCreate.length,
    };
  } catch (error) {
    throw new ApiError(500, `Slot generation failed: ${error.message}`);
  }
};

/**
 * Retrieves available slots for an appointment type within a date range
 *
 * WHY separate read service:
 * - Used by availability API (public, no auth required)
 * - Different from admin viewing all slots
 * - Applies availability business rules
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {Array} Available slots
 */
export const getAvailableSlots = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    // WHY use static method from model:
    // - Encapsulates complex query logic
    // - Consistent availability checks across app
    // - Single place to update availability rules
    const slots = await Slot.findAvailableSlots(
      appointmentTypeId,
      startDate,
      endDate
    );

    return slots;
  } catch (error) {
    throw new ApiError(
      500,
      `Failed to fetch available slots: ${error.message}`
    );
  }
};

/**
 * Checks if a specific slot is available for booking
 *
 * WHY separate availability check:
 * - Used before creating booking intent
 * - Prevents wasted effort if slot is unavailable
 * - Returns detailed reason if unavailable
 *
 * @param {String} slotId - MongoDB ObjectId
 * @returns {Object} { available: Boolean, reason: String }
 */
export const checkSlotAvailability = async (slotId) => {
  try {
    const slot = await Slot.findById(slotId);

    if (!slot) {
      return { available: false, reason: "Slot not found" };
    }

    if (slot.status === "BLOCKED") {
      return { available: false, reason: "Slot is blocked" };
    }

    if (slot.bookedCount >= slot.capacity) {
      return { available: false, reason: "Slot is fully booked" };
    }

    if (slot.startTime <= new Date()) {
      return { available: false, reason: "Slot is in the past" };
    }

    return { available: true, slot };
  } catch (error) {
    throw new ApiError(500, `Availability check failed: ${error.message}`);
  }
};

/**
 * Blocks/unblocks a slot (admin operation)
 *
 * WHY not delete:
 * - Preserves history and references
 * - Can be re-enabled later
 * - Existing bookings remain valid
 *
 * @param {String} slotId - MongoDB ObjectId
 * @param {Boolean} blocked - true to block, false to unblock
 * @returns {Object} Updated slot
 */
export const toggleSlotStatus = async (slotId, blocked) => {
  try {
    const slot = await Slot.findById(slotId);

    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    slot.status = blocked ? "BLOCKED" : "AVAILABLE";
    await slot.save();

    return slot;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to update slot status: ${error.message}`);
  }
};

/**
 * Blocks multiple slots in bulk (for holidays, time off)
 *
 * WHY bulk operation:
 * - Efficient for blocking date ranges
 * - Useful for holidays, vacation
 * - Single transaction for consistency
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId
 * @param {Date} startDate - Start of blocking period
 * @param {Date} endDate - End of blocking period
 * @returns {Object} Update result
 */
export const blockSlotsInRange = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    const result = await Slot.updateMany(
      {
        appointmentTypeId,
        startTime: { $gte: startDate, $lte: endDate },
        status: "AVAILABLE", // Only block available slots
      },
      {
        $set: { status: "BLOCKED" },
      }
    );

    return {
      success: true,
      message: `Blocked ${result.modifiedCount} slots`,
      modifiedCount: result.modifiedCount,
    };
  } catch (error) {
    throw new ApiError(500, `Failed to block slots: ${error.message}`);
  }
};

/**
 * Increments booked count for a slot (used during booking)
 *
 * WHY atomic operation:
 * - Prevents race conditions during concurrent bookings
 * - Uses MongoDB's atomic findOneAndUpdate
 * - Only succeeds if capacity not exceeded
 * - No manual locking required
 *
 * @param {String} slotId - MongoDB ObjectId
 * @param {Object} session - Mongoose transaction session
 * @returns {Object} Updated slot or null if failed
 */
export const incrementSlotBookedCount = async (slotId, session = null) => {
  try {
    // WHY findOneAndUpdate with conditions:
    // - Atomic operation prevents double-booking
    // - Only increments if conditions met
    // - Returns null if conditions fail (slot full)
    // - Works within transactions for consistency
    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        status: "AVAILABLE",
        $expr: { $lt: ["$bookedCount", "$capacity"] }, // bookedCount < capacity
      },
      {
        $inc: { bookedCount: 1 }, // Atomic increment
      },
      {
        new: true, // Return updated document
        session, // Support transactions
      }
    );

    return slot;
  } catch (error) {
    throw new ApiError(500, `Failed to book slot: ${error.message}`);
  }
};

/**
 * Decrements booked count for a slot (used during cancellation)
 *
 * WHY separate decrement function:
 * - Handles cancellation logic
 * - Prevents negative bookedCount
 * - Maintains inventory integrity
 *
 * @param {String} slotId - MongoDB ObjectId
 * @param {Object} session - Mongoose transaction session
 * @returns {Object} Updated slot
 */
export const decrementSlotBookedCount = async (slotId, session = null) => {
  try {
    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        bookedCount: { $gt: 0 }, // Prevent negative count
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
      throw new ApiError(404, "Slot not found or already at zero bookings");
    }

    return slot;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to release slot: ${error.message}`);
  }
};

/**
 * Deletes old slots (cleanup job)
 *
 * WHY delete old slots:
 * - Prevents database bloat
 * - Past slots with no bookings are useless
 * - Improves query performance
 *
 * @param {Date} beforeDate - Delete slots ending before this date
 * @returns {Object} Deletion result
 */
export const deleteOldSlots = async (beforeDate) => {
  try {
    // WHY only delete slots with no bookings:
    // - Preserves history for booked slots
    // - Safe cleanup of unused inventory
    const result = await Slot.deleteMany({
      endTime: { $lt: beforeDate },
      bookedCount: 0,
    });

    return {
      success: true,
      message: `Deleted ${result.deletedCount} old slots`,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    throw new ApiError(500, `Failed to delete old slots: ${error.message}`);
  }
};

/**
 * Gets slot statistics for an appointment type
 *
 * WHY statistics:
 * - Helps organizers understand utilization
 * - Identifies popular time slots
 * - Informs scheduling decisions
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId
 * @param {Date} startDate - Start of analysis period
 * @param {Date} endDate - End of analysis period
 * @returns {Object} Statistics object
 */
export const getSlotStatistics = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    const stats = await Slot.aggregate([
      {
        $match: {
          appointmentTypeId: new mongoose.Types.ObjectId(appointmentTypeId),
          startTime: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalSlots: { $sum: 1 },
          availableSlots: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "AVAILABLE"] },
                    { $lt: ["$bookedCount", "$capacity"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          fullyBookedSlots: {
            $sum: {
              $cond: [{ $gte: ["$bookedCount", "$capacity"] }, 1, 0],
            },
          },
          blockedSlots: {
            $sum: { $cond: [{ $eq: ["$status", "BLOCKED"] }, 1, 0] },
          },
          totalCapacity: { $sum: "$capacity" },
          totalBooked: { $sum: "$bookedCount" },
        },
      },
    ]);

    if (stats.length === 0) {
      return {
        totalSlots: 0,
        availableSlots: 0,
        fullyBookedSlots: 0,
        blockedSlots: 0,
        utilizationRate: 0,
      };
    }

    const result = stats[0];
    return {
      ...result,
      utilizationRate:
        result.totalCapacity > 0
          ? ((result.totalBooked / result.totalCapacity) * 100).toFixed(2)
          : 0,
    };
  } catch (error) {
    throw new ApiError(500, `Failed to calculate statistics: ${error.message}`);
  }
};

export default {
  generateAndSaveSlots,
  getAvailableSlots,
  checkSlotAvailability,
  toggleSlotStatus,
  blockSlotsInRange,
  incrementSlotBookedCount,
  decrementSlotBookedCount,
  deleteOldSlots,
  getSlotStatistics,
};
