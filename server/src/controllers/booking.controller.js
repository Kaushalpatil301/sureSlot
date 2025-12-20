import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import {
  createBooking,
  cancelBooking,
  getUserBookings,
  getBookingById,
} from "../services/booking.service.js";

export const createBookingController = asyncHandler(async (req, res) => {
  const { slotId } = req.body;

  if (!slotId) {
    throw new ApiError(400, "slotId is required");
  }

  const userId = req.user._id;

  const booking = await createBooking(userId, slotId);

  return res
    .status(201)
    .json(new ApiResponse(201, booking, "Booking created successfully"));
});

export const getUserBookingsController = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;

  const bookings = await getUserBookings(userId, status);

  return res
    .status(200)
    .json(
      new ApiResponse(200, bookings, `Found ${bookings.length} booking(s)`)
    );
});

export const getBookingByIdController = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  if (!bookingId) {
    throw new ApiError(400, "bookingId is required");
  }

  const booking = await getBookingById(bookingId, userId);

  return res
    .status(200)
    .json(new ApiResponse(200, booking, "Booking fetched successfully"));
});

export const cancelBookingController = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  if (!bookingId) {
    throw new ApiError(400, "bookingId is required");
  }

  const cancelledBooking = await cancelBooking(bookingId, userId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, cancelledBooking, "Booking cancelled successfully")
    );
});

export default {
  createBookingController,
  getUserBookingsController,
  getBookingByIdController,
  cancelBookingController,
};
