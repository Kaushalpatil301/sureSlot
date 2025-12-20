/**
 * Slot Generator Utility
 *
 * WHY pre-generate slots instead of on-demand:
 *
 * 1. RACE CONDITION PREVENTION:
 *    - If slots are created during booking, multiple users can try to book
 *      the same time simultaneously, leading to double-booking
 *    - Pre-generated slots act as finite inventory with atomic operations
 *
 * 2. PERFORMANCE:
 *    - Booking is a hot path; generation is slow (calculations, DB writes)
 *    - Pre-generation moves heavy work out of the booking flow
 *    - Users get instant availability without waiting for generation
 *
 * 3. CONSISTENCY:
 *    - All availability rules (working hours, breaks, holidays) are applied once
 *    - No risk of different users seeing different availability
 *    - Single source of truth for what times exist
 *
 * 4. TRANSACTIONAL INTEGRITY:
 *    - Booking becomes a simple atomic update: increment bookedCount
 *    - No need for complex distributed locks
 *    - Database handles concurrency through optimistic locking
 */

/**
 * Generates slots for an appointment type
 *
 * @param {Object} appointmentType - The appointment type configuration
 * @param {Date} startDate - Start date for slot generation
 * @param {Date} endDate - End date for slot generation
 * @param {Object} workingHours - Working hours config { dayOfWeek: { start, end }, ... }
 * @returns {Array} Array of slot objects ready for insertion
 *
 * WHY this function is pure:
 * - Takes all inputs as parameters
 * - Returns data without side effects
 * - Easy to test and reason about
 * - Service layer handles DB operations
 */
export const generateSlots = (
  appointmentType,
  startDate,
  endDate,
  workingHours
) => {
  const slots = [];
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0); // Start at midnight

  // WHY iterate day by day:
  // - Different days have different working hours
  // - Easier to handle day boundaries
  // - Prevents slots spanning midnight
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
    const dayWorkingHours = workingHours[dayOfWeek];

    // Skip if no working hours defined for this day (e.g., weekends)
    if (!dayWorkingHours || !dayWorkingHours.enabled) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Generate slots for this day
    const daySlo = generateSlotsForDay(
      appointmentType,
      currentDate,
      dayWorkingHours
    );

    slots.push(...daySlo);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return slots;
};

/**
 * Generates slots for a single day
 *
 * WHY separate function for single day:
 * - Separation of concerns
 * - Easier to test individual day generation
 * - Handles day-specific logic in isolation
 */
const generateSlotsForDay = (appointmentType, date, workingHours) => {
  const slots = [];

  // Parse working hours
  const [startHour, startMinute] = workingHours.start.split(":").map(Number);
  const [endHour, endMinute] = workingHours.end.split(":").map(Number);

  // Create start time for the day
  const currentSlotStart = new Date(date);
  currentSlotStart.setHours(startHour, startMinute, 0, 0);

  // Create end time for the day
  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, endMinute, 0, 0);

  // WHY buffer time:
  // - Prevents back-to-back appointments (gives organizer prep time)
  // - Can be 0 for no buffer
  // - Applied after each slot
  const bufferMinutes = appointmentType.bufferTime || 0;
  const totalSlotDuration = appointmentType.duration + bufferMinutes;

  // WHY generate until end of day:
  // - Slots must fit within working hours
  // - Last slot must end before or at day end time
  while (
    currentSlotStart.getTime() + appointmentType.duration * 60 * 1000 <=
    dayEnd.getTime()
  ) {
    const slotEnd = new Date(
      currentSlotStart.getTime() + appointmentType.duration * 60 * 1000
    );

    // Create slot object
    slots.push({
      appointmentTypeId: appointmentType._id,
      startTime: new Date(currentSlotStart),
      endTime: slotEnd,
      capacity: appointmentType.capacity || 1,
      bookedCount: 0,
      status: "AVAILABLE",
    });

    // Move to next slot (duration + buffer)
    currentSlotStart.setMinutes(
      currentSlotStart.getMinutes() + totalSlotDuration
    );
  }

  return slots;
};

/**
 * Validates slot generation parameters
 *
 * WHY validate before generation:
 * - Fail fast with clear error messages
 * - Prevents generating invalid slots
 * - Saves unnecessary computation
 */
export const validateSlotGenerationParams = (
  appointmentType,
  startDate,
  endDate,
  workingHours
) => {
  const errors = [];

  if (!appointmentType || !appointmentType._id) {
    errors.push("Appointment type is required");
  }

  if (!appointmentType.duration || appointmentType.duration <= 0) {
    errors.push("Appointment duration must be greater than 0");
  }

  if (!(startDate instanceof Date) || isNaN(startDate)) {
    errors.push("Valid start date is required");
  }

  if (!(endDate instanceof Date) || isNaN(endDate)) {
    errors.push("Valid end date is required");
  }

  if (startDate >= endDate) {
    errors.push("End date must be after start date");
  }

  if (!workingHours || typeof workingHours !== "object") {
    errors.push("Working hours configuration is required");
  }

  if (errors.length > 0) {
    throw new Error(`Slot generation validation failed: ${errors.join(", ")}`);
  }

  return true;
};

/**
 * Calculates how many slots will be generated (without creating them)
 *
 * WHY this function:
 * - Preview slot count before actual generation
 * - Useful for UI feedback ("This will create X slots")
 * - Prevents accidental generation of thousands of slots
 */
export const estimateSlotCount = (
  appointmentType,
  startDate,
  endDate,
  workingHours
) => {
  // Reuse the generation logic but just count
  const slots = generateSlots(
    appointmentType,
    startDate,
    endDate,
    workingHours
  );
  return slots.length;
};

/**
 * Default working hours (Monday-Friday, 9 AM - 5 PM)
 *
 * WHY provide defaults:
 * - Sensible starting point for new users
 * - Reduces configuration burden
 * - Can be overridden per appointment type
 */
export const DEFAULT_WORKING_HOURS = {
  0: { enabled: false }, // Sunday
  1: { enabled: true, start: "09:00", end: "17:00" }, // Monday
  2: { enabled: true, start: "09:00", end: "17:00" }, // Tuesday
  3: { enabled: true, start: "09:00", end: "17:00" }, // Wednesday
  4: { enabled: true, start: "09:00", end: "17:00" }, // Thursday
  5: { enabled: true, start: "09:00", end: "17:00" }, // Friday
  6: { enabled: false }, // Saturday
};
