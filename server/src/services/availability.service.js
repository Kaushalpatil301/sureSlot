import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";

/**
 * Availability Service - Pure READ domain
 *
 * WHY read-only is critical:
 *
 * 1. CORRECTNESS:
 *    - Multiple users can check availability simultaneously without conflicts
 *    - No mutations means no race conditions during reads
 *    - What users see is always current state, never stale locks
 *
 * 2. SCALABILITY:
 *    - Read operations can be cached aggressively
 *    - No database locks needed for reads
 *    - Can be horizontally scaled without coordination
 *    - Multiple replicas can serve read requests
 *
 * 3. SEPARATION OF CONCERNS:
 *    - Availability = "what exists" (inventory query)
 *    - Booking = "claim inventory" (write operation)
 *    - Clear boundary prevents mixing responsibilities
 *
 * 4. USER EXPERIENCE:
 *    - Fast responses (no locking overhead)
 *    - No "slot held for X minutes" confusion
 *    - Users see real-time availability
 *    - Booking is the single point of contention (as it should be)
 *
 * 5. AVOID PESSIMISTIC LOCKING:
 *    - Locking slots during browsing creates false scarcity
 *    - Locked slots that are never booked waste inventory
 *    - Lock timeouts add complexity and edge cases
 *    - Optimistic approach (atomic booking) is simpler and more reliable
 */

/**
 * Gets available slots for an appointment type on a specific date
 *
 * WHY use date boundaries:
 * - Most users check availability for a single day
 * - Reduces data transferred over network
 * - Faster queries with indexed date range
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @param {Date} date - The date to check (will use start/end of day)
 * @returns {Array} Available slots sorted by startTime
 */
export const getAvailabilityForDate = async (appointmentTypeId, date) => {
  try {
    // Validate appointmentTypeId
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    // Validate date
    if (!(date instanceof Date) || isNaN(date)) {
      throw new ApiError(400, "Valid date is required");
    }

    // Calculate date boundaries (start and end of the day)
    // WHY boundaries:
    // - Users think in days, not specific times
    // - Efficient index usage with range queries
    // - Prevents loading unnecessary data
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // WHY use findAvailableSlots static method:
    // - Encapsulates complex availability logic
    // - Consistent filtering across the application
    // - Single source of truth for availability rules
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

/**
 * Gets available slots for a date range
 *
 * WHY support date ranges:
 * - Useful for calendar views
 * - Allows users to see availability across multiple days
 * - Still maintains read-only semantics
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {Array} Available slots sorted by startTime
 */
export const getAvailabilityForDateRange = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    // Validate inputs
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

    // WHY limit date range:
    // - Prevents loading excessive data
    // - Protects against malicious queries
    // - Typical use case is 7-30 days
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

    // Fetch available slots for the range
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

/**
 * Groups available slots by date for easier client consumption
 *
 * WHY group by date:
 * - Better UX for calendar/date picker interfaces
 * - Reduces client-side processing
 * - Shows which dates have availability at a glance
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {Object} Slots grouped by date { "YYYY-MM-DD": [slots] }
 */
export const getAvailabilityGroupedByDate = async (
  appointmentTypeId,
  startDate,
  endDate
) => {
  try {
    // Reuse existing service method
    const slots = await getAvailabilityForDateRange(
      appointmentTypeId,
      startDate,
      endDate
    );

    // Group slots by date
    // WHY in service layer:
    // - Controller stays thin
    // - Reusable grouping logic
    // - Testable without HTTP layer
    const groupedSlots = slots.reduce((acc, slot) => {
      const dateKey = slot.startTime.toISOString().split("T")[0]; // YYYY-MM-DD

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

/**
 * Checks if any availability exists for a date (quick check)
 *
 * WHY quick check:
 * - Useful for calendar date highlighting
 * - No need to load full slot details
 * - Just boolean: has availability or not
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @param {Date} date - The date to check
 * @returns {Boolean} true if at least one slot is available
 */
export const hasAvailabilityForDate = async (appointmentTypeId, date) => {
  try {
    // Validate inputs
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    if (!(date instanceof Date) || isNaN(date)) {
      throw new ApiError(400, "Valid date is required");
    }

    // Calculate date boundaries
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // WHY use findOne instead of find:
    // - Only need to know if at least one exists
    // - Much faster than loading all slots
    // - Less data transferred
    const hasSlot = await Slot.findOne({
      appointmentTypeId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: "AVAILABLE",
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    }).lean(); // WHY lean: only need existence check, no need for mongoose document

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
