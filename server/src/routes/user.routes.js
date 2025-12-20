import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import * as userController from "../controllers/user.controller.js";

const router = Router();

/**
 * User Routes - Profile and booking management
 *
 * All routes require authentication (verifyJWT)
 */

/**
 * GET /api/v1/users/me
 * Get current user's profile
 */
router.get("/me", verifyJWT, userController.getMyProfile);

/**
 * PUT /api/v1/users/me
 * Update current user's profile
 * Body: { fullname, avatar }
 */
router.put("/me", verifyJWT, userController.updateMyProfile);

/**
 * GET /api/v1/users/me/bookings
 * Get current user's bookings with filters
 * Query params:
 * - status: PENDING | CONFIRMED | CANCELLED
 * - upcoming: true (show future bookings)
 * - past: true (show past bookings)
 * - page: number (default 1)
 * - limit: number (default 10)
 */
router.get("/me/bookings", verifyJWT, userController.getMyBookings);

export default router;
