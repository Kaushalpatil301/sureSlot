

export const generateSlots = (
  appointmentType,
  startDate,
  endDate,
  workingHours
) => {
  const slots = [];
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0); 

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); 
    const dayWorkingHours = workingHours[dayOfWeek];

    if (!dayWorkingHours || !dayWorkingHours.enabled) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

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

const generateSlotsForDay = (appointmentType, date, workingHours) => {
  const slots = [];

  const [startHour, startMinute] = workingHours.start.split(":").map(Number);
  const [endHour, endMinute] = workingHours.end.split(":").map(Number);

  const currentSlotStart = new Date(date);
  currentSlotStart.setHours(startHour, startMinute, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, endMinute, 0, 0);

  const bufferMinutes = appointmentType.bufferTime || 0;
  const totalSlotDuration = appointmentType.duration + bufferMinutes;

  while (
    currentSlotStart.getTime() + appointmentType.duration * 60 * 1000 <=
    dayEnd.getTime()
  ) {
    const slotEnd = new Date(
      currentSlotStart.getTime() + appointmentType.duration * 60 * 1000
    );

    slots.push({
      appointmentTypeId: appointmentType._id,
      startTime: new Date(currentSlotStart),
      endTime: slotEnd,
      capacity: appointmentType.capacity || 1,
      bookedCount: 0,
      status: "AVAILABLE",
    });

    currentSlotStart.setMinutes(
      currentSlotStart.getMinutes() + totalSlotDuration
    );
  }

  return slots;
};

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

export const estimateSlotCount = (
  appointmentType,
  startDate,
  endDate,
  workingHours
) => {
  
  const slots = generateSlots(
    appointmentType,
    startDate,
    endDate,
    workingHours
  );
  return slots.length;
};

export const DEFAULT_WORKING_HOURS = {
  0: { enabled: false }, 
  1: { enabled: true, start: "09:00", end: "17:00" }, 
  2: { enabled: true, start: "09:00", end: "17:00" }, 
  3: { enabled: true, start: "09:00", end: "17:00" }, 
  4: { enabled: true, start: "09:00", end: "17:00" }, 
  5: { enabled: true, start: "09:00", end: "17:00" }, 
  6: { enabled: false }, 
};
