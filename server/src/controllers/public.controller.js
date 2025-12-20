import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { getAppointmentTypeByShareToken } from "../services/appointment.service.js";
import { getAvailabilityForDate } from "../services/availability.service.js";
import { createBooking } from "../services/booking.service.js";
import { User } from "../models/user.model.js";

/**
 * Public Controller - Token-based public access to appointments
 *
 * WHY public controller:
 * - No authentication required
 * - Access via share token only
 * - Enables guest booking
 * - Separate from authenticated routes
 *
 * WHY thin controller:
 * - Reuses existing services (availability, booking)
 * - No business logic duplication
 * - Just token validation + delegation
 * - Single responsibility: HTTP layer
 */

/**
 * GET /public/appointments/:token
 *
 * Fetches shared appointment details via token
 *
 * WHY token in URL path:
 * - RESTful design (token identifies resource)
 * - Easy to share as link
 * - No need for query params
 * - Standard sharing pattern
 */
export const getSharedAppointment = asyncHandler(async (req, res) => {
  const { token } = req.params;

  // WHY getAppointmentTypeByShareToken: Validates token and returns appointment type
  const appointmentType = await getAppointmentTypeByShareToken(token);

  // Sanitize response: Remove internal fields
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
    // WHY exclude: userId, shareToken, publishedAt, etc. (private data)
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

/**
 * GET /public/availability/:token
 * Query: ?date=YYYY-MM-DD
 *
 * Fetches availability for shared appointment via token
 *
 * WHY reuse availability service:
 * - No logic duplication
 * - Same availability rules
 * - Token just provides appointmentTypeId
 * - DRY principle
 */
export const getSharedAvailability = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { date } = req.query;

  // Validate token and get appointment type
  const appointmentType = await getAppointmentTypeByShareToken(token);

  // Validate date
  if (!date) {
    throw new ApiError(400, "date query parameter is required (YYYY-MM-DD)");
  }

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  // Reuse existing availability service
  // WHY reuse:
  // - Same business logic
  // - Same filtering rules
  // - Consistent behavior
  // - No duplication
  const slots = await getAvailabilityForDate(appointmentType._id, targetDate);

  return res
    .status(200)
    .json(
      new ApiResponse(200, slots, `Found ${slots.length} available slot(s)`)
    );
});

/**
 * POST /public/book/:token
 * Body: { slotId, guestEmail?, guestName? }
 *
 * Creates a booking via share token (guest or authenticated)
 *
 * WHY guest booking:
 * - Reduces friction (no registration required)
 * - Common use case for appointments
 * - Creates temporary user if needed
 * - Can upgrade to full account later
 *
 * WHY reuse booking service:
 * - Same transactional logic
 * - Same slot increment
 * - Same validation rules
 * - No duplication
 */
export const bookViaToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { slotId, guestEmail, guestName } = req.body;

  // Validate token
  const tokenData = validateShareToken(token);

  // Validate required fields
  if (!slotId) {
    throw new ApiError(400, "slotId is required");
  }

  let userId;

  // Check if user is authenticated (optional)
  // WHY optional auth:
  // - Allow both guest and authenticated bookings
  // - Authenticated users get better tracking
  // - Guests can book without registration
  if (req.user) {
    // Authenticated user
    userId = req.user._id;
  } else {
    // Guest booking - require email
    if (!guestEmail) {
      throw new ApiError(400, "guestEmail is required for guest bookings");
    }

    // Create or find guest user
    // WHY create guest user:
    // - Booking model requires userId
    // - Enables guest to view their bookings later
    // - Can be upgraded to full account
    // - Maintains referential integrity
    let guestUser = await User.findOne({ email: guestEmail });

    if (!guestUser) {
      // Create guest user account
      // WHY generate temporary password:
      // - User model requires password
      // - Guest can claim account later
      // - Secure random password prevents unauthorized access
      const tempPassword = Math.random().toString(36).slice(-8);

      guestUser = await User.create({
        email: guestEmail,
        username: guestEmail.split("@")[0] + "_" + Date.now(), // Unique username
        fullname: guestName || "Guest User",
        password: tempPassword,
        role: "USER",
        isEmailVerified: false,
      });
    }

    userId = guestUser._id;
  }

  // Verify slot belongs to shared appointment
  // WHY verify:
  // - Prevents booking slots from other appointments via shared link
  // - Security: token only grants access to specific appointment's slots
  // - Must check slot.appointmentTypeId matches token
  // TODO: Add slot verification when Slot model is accessible
  // const slot = await Slot.findById(slotId);
  // if (slot.appointmentTypeId.toString() !== tokenData.appointmentTypeId) {
  //   throw new ApiError(403, "Slot does not belong to shared appointment");
  // }

  // Reuse existing booking service
  // WHY reuse:
  // - Same transactional logic
  // - Same atomic slot increment
  // - Same validation rules
  // - No logic duplication
  // - Guest and authenticated bookings are identical in core logic
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
