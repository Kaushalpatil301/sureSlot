import { Router } from "express";
import {
  getSharedAppointment,
  getSharedAvailability,
  bookViaToken,
} from "../controllers/public.controller.js";

/**
 * Public Routes - No authentication required
 *
 * WHY no authentication:
 * - Designed for public access via share links
 * - Token provides authorization (bearer token)
 * - Enables guest bookings
 * - Reduces friction for end users
 *
 * WHY token-based security:
 * - Token acts as cryptographic proof of access
 * - Cannot enumerate appointments (unlike ID-based URLs)
 * - Revocable without deleting appointment
 * - Fine-grained access control
 *
 * SECURITY CONSIDERATIONS:
 * - No admin data exposed through these endpoints
 * - Token validation happens in controller/service
 * - Guest users are created with minimal permissions
 * - Slot verification prevents cross-appointment booking
 */

const router = Router();

/**
 * GET /api/v1/public/appointments/:token
 *
 * Fetches shared appointment details
 *
 * Response:
 * - Appointment type details (name, description, duration, etc.)
 * - NO admin fields (userId, internal settings)
 * - NO private data
 *
 * Use case:
 * - User receives share link
 * - Views appointment details before booking
 * - No account required
 *
 * WHY token in path:
 * - RESTful design
 * - Token identifies the resource
 * - Easy to share as link: /public/appointments/AbCd123XyZ
 */
router.get("/appointments/:token", getSharedAppointment);

/**
 * GET /api/v1/public/availability/:token?date=YYYY-MM-DD
 *
 * Fetches availability for shared appointment
 *
 * Query params:
 * - date (required): Date to check availability (YYYY-MM-DD)
 *
 * Response:
 * - Array of available slots
 * - Same format as authenticated availability endpoint
 *
 * Use case:
 * - User browses available times
 * - Selects a slot to book
 * - No account required
 *
 * WHY reuse availability service:
 * - Same business logic
 * - No duplication
 * - Consistent behavior
 * - Token just provides appointmentTypeId
 */
router.get("/availability/:token", getSharedAvailability);

/**
 * POST /api/v1/public/book/:token
 *
 * Creates a booking via share token
 *
 * Body:
 * - slotId (required): The slot to book
 * - guestEmail (required for guests): Email for guest booking
 * - guestName (optional): Name for guest booking
 *
 * Auth:
 * - Optional: Can be authenticated OR guest
 * - If no auth token: guest booking (requires guestEmail)
 * - If auth token: authenticated booking
 *
 * Response:
 * - Created booking
 * - Same format as authenticated booking
 *
 * Use case:
 * - User selects slot from availability
 * - Books without registration (guest)
 * - OR books with existing account
 *
 * WHY reuse booking service:
 * - Same transactional logic
 * - Same atomic operations
 * - No logic duplication
 * - Guest booking creates temporary user
 *
 * SECURITY:
 * - Token validates access to appointment
 * - Slot verification prevents cross-appointment booking
 * - Guest users have minimal permissions
 * - Transaction ensures atomicity
 */
router.post("/book/:token", bookViaToken);

export default router;
