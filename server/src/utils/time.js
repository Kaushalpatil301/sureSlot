

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

export const timeToMinutes = (timeString) => {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

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

export const getDurationMinutes = (start, end) => {
  return Math.floor((end - start) / (1000 * 60));
};

export const addMinutes = (date, minutes) => {
  return new Date(date.getTime() + minutes * 60 * 1000);
};

export const doTimeRangesOverlap = (start1, end1, start2, end2) => {
  return start1 < end2 && start2 < end1;
};

export const formatDate = (date) => {
  return date.toISOString().split("T")[0];
};

export const parseDate = (dateString) => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return date;
};
