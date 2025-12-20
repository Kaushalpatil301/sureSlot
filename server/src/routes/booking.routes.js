import { Router } from "express";
import {
  createBookingController,
  getUserBookingsController,
  getBookingByIdController,
  cancelBookingController,
} from "../controllers/booking.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

/**
 * Booking Routes - Protected endpoints for booking management
 *
 * WHY all routes require authentication:
 * - Bookings are user-specific
 * - Must know who is making the booking
 * - Prevents anonymous bookings
 * - Security: only authenticated users can book
 *
 * WHY verifyJWT middleware:
 * - Extracts user from JWT token
 * - Sets req.user for controllers/services
 * - Rejects requests without valid token
 * - Single point of authentication enforcement
 */

const router = Router();

// Apply authentication to all booking routes
// WHY middleware at router level:
// - DRY: don't repeat verifyJWT on each route
// - All booking operations require auth
// - Clear security boundary
router.use(verifyJWT);

/**
 * POST /api/v1/bookings
 *
 * Create a new booking
 *
 * Body:
 * - slotId (required): The slot to book
 *
 * Auth: Required (JWT)
 *
 * Response: Created booking with 201 status
 *
 * WHY POST:
 * - Creates a new resource (booking)
 * - Modifies state (increments slot.bookedCount)
 * - RESTful convention for creation
 */
router.post("/", createBookingController);

/**
 * GET /api/v1/bookings
 *
 * Get all bookings for authenticated user
 *
 * Query params:
 * - status (optional): Filter by PENDING, CONFIRMED, or CANCELLED
 *
 * Auth: Required (JWT)
 *
 * Response: Array of bookings
 *
 * WHY user-scoped:
 * - User sees only their own bookings
 * - No need for userId in query (from JWT)
 * - Security: prevents viewing others' bookings
 */
router.get("/", getUserBookingsController);

/**
 * GET /api/v1/bookings/:bookingId
 *
 * Get a specific booking by ID
 *
 * Params:
 * - bookingId: MongoDB ObjectId
 *
 * Auth: Required (JWT)
 *
 * Response: Booking details
 *
 * WHY authorization check:
 * - Service verifies user owns the booking
 * - Returns 403 if not authorized
 * - Can't access other users' bookings
 */
router.get("/:bookingId", getBookingByIdController);

/**
 * DELETE /api/v1/bookings/:bookingId
 *
 * Cancel a booking (soft delete)
 *
 * Params:
 * - bookingId: MongoDB ObjectId
 *
 * Auth: Required (JWT)
 *
 * Response: Cancelled booking with status CANCELLED
 *
 * WHY DELETE method:
 * - RESTful convention for removal
 * - Actually performs soft delete (status = CANCELLED)
 * - Atomic transaction releases slot
 *
 * WHY soft delete:
 * - Preserves history
 * - Enables refunds
 * - Analytics on cancellation rates
 * - Maintains referential integrity
 */
router.delete("/:bookingId", cancelBookingController);

export default router;
