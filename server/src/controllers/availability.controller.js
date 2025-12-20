import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import {
  getAvailabilityForDate,
  getAvailabilityForDateRange,
  getAvailabilityGroupedByDate,
  hasAvailabilityForDate,
} from "../services/availability.service.js";

/**
 * Availability Controller - Thin HTTP layer for read-only availability
 *
 * WHY controllers are thin:
 * - Only handle HTTP concerns (request parsing, response formatting)
 * - Business logic lives in services
 * - Easy to test services without HTTP mocking
 * - Controllers are just adapters between HTTP and business logic
 */

/**
 * GET /availability
 * Query params: appointmentTypeId, date (single date or range)
 *
 * Supports two modes:
 * 1. Single date: ?appointmentTypeId=xxx&date=2025-12-20
 * 2. Date range: ?appointmentTypeId=xxx&startDate=2025-12-20&endDate=2025-12-27
 *
 * WHY flexible endpoint:
 * - Single endpoint for both use cases
 * - Reduces API surface area
 * - Client decides granularity
 */
export const getAvailability = asyncHandler(async (req, res) => {
  const { appointmentTypeId, date, startDate, endDate, grouped } = req.query;

  // Validate appointmentTypeId
  if (!appointmentTypeId) {
    throw new ApiError(400, "appointmentTypeId query parameter is required");
  }

  let slots;

  // Determine which service method to call based on query params
  if (startDate && endDate) {
    // Date range mode
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates
    if (isNaN(start.getTime())) {
      throw new ApiError(400, "Invalid startDate format. Use YYYY-MM-DD");
    }
    if (isNaN(end.getTime())) {
      throw new ApiError(400, "Invalid endDate format. Use YYYY-MM-DD");
    }

    // Check if client wants grouped response
    if (grouped === "true") {
      slots = await getAvailabilityGroupedByDate(appointmentTypeId, start, end);
    } else {
      slots = await getAvailabilityForDateRange(appointmentTypeId, start, end);
    }
  } else if (date) {
    // Single date mode
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

  // WHY ApiResponse wrapper:
  // - Consistent response format across all endpoints
  // - Client knows what to expect
  // - Easy to add metadata (count, pagination, etc.)
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

/**
 * GET /availability/check
 * Query params: appointmentTypeId, date
 *
 * Quick boolean check for availability (no slot details)
 *
 * WHY separate endpoint:
 * - Faster response for calendar highlighting
 * - No need to transfer slot data
 * - Clear intent: just checking, not fetching
 */
export const checkAvailability = asyncHandler(async (req, res) => {
  const { appointmentTypeId, date } = req.query;

  // Validate inputs
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

  // Check availability
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

/**
 * GET /availability/calendar
 * Query params: appointmentTypeId, startDate, endDate
 *
 * Returns availability grouped by date for calendar views
 *
 * WHY dedicated calendar endpoint:
 * - Optimized for calendar UI components
 * - Pre-grouped data reduces client processing
 * - Clear API intent
 */
export const getCalendarAvailability = asyncHandler(async (req, res) => {
  const { appointmentTypeId, startDate, endDate } = req.query;

  // Validate inputs
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

  // Fetch grouped availability
  const groupedSlots = await getAvailabilityGroupedByDate(
    appointmentTypeId,
    start,
    end
  );

  // Calculate metadata for client
  // WHY in controller:
  // - HTTP-specific formatting
  // - Service returns pure data
  // - Controller adds presentation layer
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
