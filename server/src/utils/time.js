/**
 * Time Utility Functions
 *
 * WHY separate utility:
 * - Time calculations are error-prone and need centralization
 * - Pure functions are easy to test
 * - Reusable across services
 */

/**
 * Check if a time falls within working hours for a specific day
 * @param {Date} dateTime - The datetime to check
 * @param {Object} workingHours - { monday: { start: "09:00", end: "17:00" }, ... }
 * @returns {boolean}
 */
export const isWithinWorkingHours = (dateTime, workingHours) => {
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayName = dayNames[dateTime.getDay()];

  const dayConfig = workingHours[dayName];
  if (!dayConfig || !dayConfig.enabled) {
    return false;
  }

  const timeString = `${String(dateTime.getHours()).padStart(2, "0")}:${String(
    dateTime.getMinutes()
  ).padStart(2, "0")}`;
  return timeString >= dayConfig.start && timeString < dayConfig.end;
};

/**
 * Parse time string to minutes (e.g., "09:30" -> 570)
 * @param {string} timeString - Format "HH:MM"
 * @returns {number} Minutes since midnight
 */
export const timeToMinutes = (timeString) => {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * Validate working hours configuration
 * @param {Object} workingHours - Working hours config
 * @returns {Object} { valid: boolean, error: string }
 */
export const validateWorkingHours = (workingHours) => {
  const dayNames = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  for (const day of dayNames) {
    const config = workingHours[day];
    if (!config) continue;

    if (config.enabled) {
      if (!config.start || !config.end) {
        return {
          valid: false,
          error: `${day}: start and end times required when enabled`,
        };
      }

      const startMinutes = timeToMinutes(config.start);
      const endMinutes = timeToMinutes(config.end);

      if (startMinutes >= endMinutes) {
        return {
          valid: false,
          error: `${day}: end time must be after start time`,
        };
      }
    }
  }

  return { valid: true };
};

/**
 * Calculate duration between two dates in minutes
 * @param {Date} start
 * @param {Date} end
 * @returns {number} Duration in minutes
 */
export const getDurationMinutes = (start, end) => {
  return Math.floor((end - start) / (1000 * 60));
};

/**
 * Add minutes to a date
 * @param {Date} date
 * @param {number} minutes
 * @returns {Date}
 */
export const addMinutes = (date, minutes) => {
  return new Date(date.getTime() + minutes * 60 * 1000);
};

/**
 * Check if two time ranges overlap
 * @param {Date} start1
 * @param {Date} end1
 * @param {Date} start2
 * @param {Date} end2
 * @returns {boolean}
 */
export const doTimeRangesOverlap = (start1, end1, start2, end2) => {
  return start1 < end2 && start2 < end1;
};

/**
 * Format date to YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export const formatDate = (date) => {
  return date.toISOString().split("T")[0];
};

/**
 * Parse date string to Date object at midnight
 * @param {string} dateString - Format "YYYY-MM-DD"
 * @returns {Date}
 */
export const parseDate = (dateString) => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return date;
};
