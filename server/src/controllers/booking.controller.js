import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import {
  createBooking,
  cancelBooking,
  getUserBookings,
  getBookingById,
} from "../services/booking.service.js";

/**
 * Booking Controller - Thin HTTP layer
 *
 * WHY thin controllers:
 * - Only handle HTTP concerns (parsing, validation, response formatting)
 * - No direct model access (uses service layer)
 * - No business logic (delegates to services)
 * - Easy to test services independently
 * - Controllers are just adapters between HTTP and domain logic
 */

/**
 * POST /bookings
 * Body: { slotId }
 *
 * Creates a new booking for the authenticated user
 *
 * WHY userId from auth middleware:
 * - Security: user can only book for themselves
 * - No need to pass userId in request body
 * - Extracted from JWT token
 */
export const createBookingController = asyncHandler(async (req, res) => {
  const { slotId } = req.body;

  // Validate required fields
  if (!slotId) {
    throw new ApiError(400, "slotId is required");
  }

  // WHY req.user:
  // - Set by auth middleware after JWT verification
  // - Ensures authenticated user
  // - Prevents booking on behalf of others
  const userId = req.user._id;

  // Delegate to service (no model access here)
  // WHY service layer:
  // - Handles transaction logic
  // - Manages slot and booking models
  // - Controller stays thin and testable
  const booking = await createBooking(userId, slotId);

  return res
    .status(201)
    .json(new ApiResponse(201, booking, "Booking created successfully"));
});

/**
 * GET /bookings
 * Query: ?status=CONFIRMED (optional)
 *
 * Gets all bookings for the authenticated user
 *
 * WHY no direct model access:
 * - Service handles query logic
 * - Consistent authorization (user sees only their bookings)
 * - Controller just formats HTTP response
 */
export const getUserBookingsController = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;

  // Delegate to service
  const bookings = await getUserBookings(userId, status);

  return res
    .status(200)
    .json(
      new ApiResponse(200, bookings, `Found ${bookings.length} booking(s)`)
    );
});

/**
 * GET /bookings/:bookingId
 *
 * Gets a specific booking by ID
 *
 * WHY authorization in service:
 * - Service verifies user owns the booking
 * - Controller doesn't need to know authorization logic
 * - Consistent security checks across all access methods
 */
export const getBookingByIdController = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  // Validate bookingId format
  if (!bookingId) {
    throw new ApiError(400, "bookingId is required");
  }

  // Delegate to service (authorization happens there)
  const booking = await getBookingById(bookingId, userId);

  return res
    .status(200)
    .json(new ApiResponse(200, booking, "Booking fetched successfully"));
});

/**
 * DELETE /bookings/:bookingId
 *
 * Cancels a booking (soft delete)
 *
 * WHY DELETE verb for cancellation:
 * - RESTful semantics: DELETE removes resource from active use
 * - Still a soft delete (status = CANCELLED)
 * - Clear intent from HTTP method
 */
export const cancelBookingController = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  // Validate bookingId format
  if (!bookingId) {
    throw new ApiError(400, "bookingId is required");
  }

  // Delegate to service (handles transaction and authorization)
  // WHY no model access:
  // - Service manages atomic cancellation + slot decrement
  // - Controller doesn't know about transactions
  // - Separation of concerns
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
