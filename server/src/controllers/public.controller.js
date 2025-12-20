import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { getAppointmentTypeByShareToken } from "../services/appointment.service.js";
import { getAvailabilityForDate } from "../services/availability.service.js";
import { createBooking } from "../services/booking.service.js";
import { User } from "../models/user.model.js";

export const getSharedAppointment = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const appointmentType = await getAppointmentTypeByShareToken(token);

  const publicData = {
    _id: appointmentType._id,
    name: appointmentType.name,
    description: appointmentType.description,
    duration: appointmentType.duration,
    price: appointmentType.price,
    currency: appointmentType.currency,
    capacity: appointmentType.capacity,
    requiresAdvancePayment: appointmentType.requiresAdvancePayment,
    questions: appointmentType.questions,
    
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        publicData,
        "Shared appointment fetched successfully"
      )
    );
});

export const getSharedAvailability = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { date } = req.query;

  const appointmentType = await getAppointmentTypeByShareToken(token);

  if (!date) {
    throw new ApiError(400, "date query parameter is required (YYYY-MM-DD)");
  }

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  const slots = await getAvailabilityForDate(appointmentType._id, targetDate);

  return res
    .status(200)
    .json(
      new ApiResponse(200, slots, `Found ${slots.length} available slot(s)`)
    );
});

export const bookViaToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { slotId, guestEmail, guestName } = req.body;

  const tokenData = validateShareToken(token);

  if (!slotId) {
    throw new ApiError(400, "slotId is required");
  }

  let userId;

  if (req.user) {
    
    userId = req.user._id;
  } else {
    
    if (!guestEmail) {
      throw new ApiError(400, "guestEmail is required for guest bookings");
    }

    let guestUser = await User.findOne({ email: guestEmail });

    if (!guestUser) {

      const tempPassword = Math.random().toString(36).slice(-8);

      guestUser = await User.create({
        email: guestEmail,
        username: guestEmail.split("@")[0] + "_" + Date.now(), 
        fullname: guestName || "Guest User",
        password: tempPassword,
        role: "USER",
        isEmailVerified: false,
      });
    }

    userId = guestUser._id;
  }

  const booking = await createBooking(userId, slotId);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        booking,
        "Booking created successfully via shared link"
      )
    );
});

export default {
  getSharedAppointment,
  getSharedAvailability,
  bookViaToken,
};
