import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import {
  getAvailabilityForDate,
  getAvailabilityForDateRange,
  getAvailabilityGroupedByDate,
  hasAvailabilityForDate,
} from "../services/availability.service.js";

export const getAvailability = asyncHandler(async (req, res) => {
  const { appointmentTypeId, date, startDate, endDate, grouped } = req.query;

  if (!appointmentTypeId) {
    throw new ApiError(400, "appointmentTypeId query parameter is required");
  }

  let slots;

  if (startDate && endDate) {
    
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      throw new ApiError(400, "Invalid startDate format. Use YYYY-MM-DD");
    }
    if (isNaN(end.getTime())) {
      throw new ApiError(400, "Invalid endDate format. Use YYYY-MM-DD");
    }

    if (grouped === "true") {
      slots = await getAvailabilityGroupedByDate(appointmentTypeId, start, end);
    } else {
      slots = await getAvailabilityForDateRange(appointmentTypeId, start, end);
    }
  } else if (date) {
    
    const targetDate = new Date(date);

    if (isNaN(targetDate.getTime())) {
      throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
    }

    slots = await getAvailabilityForDate(appointmentTypeId, targetDate);
  } else {
    throw new ApiError(
      400,
      "Either 'date' or both 'startDate' and 'endDate' are required"
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        slots,
        Array.isArray(slots)
          ? `Found ${slots.length} available slots`
          : "Availability fetched successfully"
      )
    );
});

export const checkAvailability = asyncHandler(async (req, res) => {
  const { appointmentTypeId, date } = req.query;

  if (!appointmentTypeId) {
    throw new ApiError(400, "appointmentTypeId query parameter is required");
  }

  if (!date) {
    throw new ApiError(400, "date query parameter is required");
  }

  const targetDate = new Date(date);

  if (isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  const hasAvailability = await hasAvailabilityForDate(
    appointmentTypeId,
    targetDate
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentTypeId,
        date: targetDate.toISOString().split("T")[0],
        hasAvailability,
      },
      hasAvailability
        ? "Slots are available for this date"
        : "No slots available for this date"
    )
  );
});

export const getCalendarAvailability = asyncHandler(async (req, res) => {
  const { appointmentTypeId, startDate, endDate } = req.query;

  if (!appointmentTypeId) {
    throw new ApiError(400, "appointmentTypeId query parameter is required");
  }

  if (!startDate || !endDate) {
    throw new ApiError(400, "Both startDate and endDate are required");
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    throw new ApiError(400, "Invalid startDate format. Use YYYY-MM-DD");
  }

  if (isNaN(end.getTime())) {
    throw new ApiError(400, "Invalid endDate format. Use YYYY-MM-DD");
  }

  const groupedSlots = await getAvailabilityGroupedByDate(
    appointmentTypeId,
    start,
    end
  );

  const metadata = {
    totalDays: Object.keys(groupedSlots).length,
    totalSlots: Object.values(groupedSlots).reduce(
      (sum, slots) => sum + slots.length,
      0
    ),
    dateRange: {
      start: startDate,
      end: endDate,
    },
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        slots: groupedSlots,
        metadata,
      },
      "Calendar availability fetched successfully"
    )
  );
});

export default {
  getAvailability,
  checkAvailability,
  getCalendarAvailability,
};
