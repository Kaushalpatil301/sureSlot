import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import * as appointmentController from "../controllers/appointment.controller.js";

const router = Router();

/**
 * Appointment Routes - Manage appointment type configuration
 *
 * WHY separate from availability/booking routes:
 * - Appointments are CONFIGURATION (rules, settings)
 * - Availability is READ-ONLY (what times are available)
 * - Bookings are TRANSACTIONS (user books a slot)
 * - Clear separation of concerns
 */

// ============ CRUD Operations ============

/**
 * GET /api/v1/appointments
 * Get all appointment types for logged-in user
 * Query params: isPublished, isShareEnabled
 */
router.get("/", verifyJWT, appointmentController.getAppointmentTypes);

/**
 * GET /api/v1/appointments/:id
 * Get single appointment type
 */
router.get("/:id", verifyJWT, appointmentController.getAppointmentTypeById);

/**
 * POST /api/v1/appointments
 * Create new appointment type (draft state)
 */
router.post("/", verifyJWT, appointmentController.createAppointmentType);

/**
 * PATCH /api/v1/appointments/:id
 * Update appointment type
 * WHY PATCH: Partial updates allowed
 */
router.patch("/:id", verifyJWT, appointmentController.updateAppointmentType);

/**
 * DELETE /api/v1/appointments/:id
 * Soft delete appointment type
 * WHY soft delete: Preserves bookings and referential integrity
 */
router.delete("/:id", verifyJWT, appointmentController.deleteAppointmentType);

// ============ Publishing Actions ============

/**
 * POST /api/v1/appointments/:id/publish
 * Publish appointment type (makes publicly bookable)
 * WHY triggers slot generation
 */
router.post(
  "/:id/publish",
  verifyJWT,
  appointmentController.publishAppointmentType
);

/**
 * POST /api/v1/appointments/:id/unpublish
 * Unpublish appointment type (removes from public listing)
 */
router.post(
  "/:id/unpublish",
  verifyJWT,
  appointmentController.unpublishAppointmentType
);

// ============ Sharing Actions ============

/**
 * POST /api/v1/appointments/:id/share/enable
 * Enable sharing (generates secure token for public access)
 * WHY separate from publish: Unlisted but bookable via direct link
 */
router.post(
  "/:id/share/enable",
  verifyJWT,
  appointmentController.enableSharing
);

/**
 * POST /api/v1/appointments/:id/share/disable
 * Disable sharing (revokes token)
 */
router.post(
  "/:id/share/disable",
  verifyJWT,
  appointmentController.disableSharing
);

// ============ Public Listing ============

/**
 * GET /api/v1/appointments/public/list
 * Get published appointment types (public directory)
 * WHY public route: No authentication required for discovery
 * Query params: providerId
 */
router.get("/public/list", appointmentController.getPublicAppointmentTypes);

export default router;
