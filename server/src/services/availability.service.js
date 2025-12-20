import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";

export const getAvailabilityForDate = async (appointmentTypeId, date) => {
  try {
    
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    if (!(date instanceof Date) || isNaN(date)) {
      throw new ApiError(400, "Valid date is required");
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const availableSlots = await Slot.findAvailableSlots(
      appointmentTypeId,
      startOfDay,
      endOfDay
    );

    return availableSlots;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch availability: ${error.message}`);
  }
};

export const getAvailabilityForDateRange = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    if (!(startDate instanceof Date) || isNaN(startDate)) {
      throw new ApiError(400, "Valid start date is required");
    }

    if (!(endDate instanceof Date) || isNaN(endDate)) {
      throw new ApiError(400, "Valid end date is required");
    }

    if (startDate >= endDate) {
      throw new ApiError(400, "End date must be after start date");
    }

    const maxDaysAllowed = 90;
    const daysDifference = Math.ceil(
      (endDate - startDate) / (1000 * 60 * 60 * 24)
    );

    if (daysDifference > maxDaysAllowed) {
      throw new ApiError(
        400,
        `Date range too large. Maximum ${maxDaysAllowed} days allowed`
      );
    }

    const availableSlots = await Slot.findAvailableSlots(
      appointmentTypeId,
      startDate,
      endDate
    );

    return availableSlots;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      `Failed to fetch availability for date range: ${error.message}`
    );
  }
};

export const getAvailabilityGroupedByDate = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    
    const slots = await getAvailabilityForDateRange(
      appointmentTypeId,
      startDate,
      endDate
    );

    const groupedSlots = slots.reduce((acc, slot) => {
      const dateKey = slot.startTime.toISOString().split("T")[0]; 

      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }

      acc[dateKey].push(slot);
      return acc;
    }, {});

    return groupedSlots;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      `Failed to fetch grouped availability: ${error.message}`
    );
  }
};

export const hasAvailabilityForDate = async (appointmentTypeId, date) => {
  try {
    
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    if (!(date instanceof Date) || isNaN(date)) {
      throw new ApiError(400, "Valid date is required");
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const hasSlot = await Slot.findOne({
      appointmentTypeId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: "AVAILABLE",
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    }).lean(); 

    return !!hasSlot;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to check availability: ${error.message}`);
  }
};

export default {
  getAvailabilityForDate,
  getAvailabilityForDateRange,
  getAvailabilityGroupedByDate,
  hasAvailabilityForDate,
};
