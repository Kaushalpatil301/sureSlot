import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  generateSlots,
  validateSlotGenerationParams,
  estimateSlotCount,
  DEFAULT_WORKING_HOURS,
} from "../utils/slot-generator.js";
import mongoose from "mongoose";

export const generateAndSaveSlots = async (
  appointmentType,
  startDate,
  endDate,
  workingHours = DEFAULT_WORKING_HOURS
) => {
  try {
    
    validateSlotGenerationParams(
      appointmentType,
      startDate,
      endDate,
      workingHours
    );

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

    let created = 0;
    let duplicates = 0;

    try {
      const result = await Slot.insertMany(slotsToCreate, {
        ordered: false, 
      });
      created = result.length;
    } catch (error) {
      
      if (error.code === 11000) {
        
        created = error.insertedDocs ? error.insertedDocs.length : 0;
        duplicates = slotsToCreate.length - created;
      } else {
        throw error; 
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

export const getAvailableSlots = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {

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
        status: "AVAILABLE", 
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

export const incrementSlotBookedCount = async (slotId, session = null) => {
  try {

    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        status: "AVAILABLE",
        $expr: { $lt: ["$bookedCount", "$capacity"] }, 
      },
      {
        $inc: { bookedCount: 1 }, 
      },
      {
        new: true, 
        session, 
      }
    );

    return slot;
  } catch (error) {
    throw new ApiError(500, `Failed to book slot: ${error.message}`);
  }
};

export const decrementSlotBookedCount = async (slotId, session = null) => {
  try {
    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        bookedCount: { $gt: 0 }, 
      },
      {
        $inc: { bookedCount: -1 }, 
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

export const deleteOldSlots = async (beforeDate) => {
  try {

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
