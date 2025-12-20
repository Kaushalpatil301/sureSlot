import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/auth.middleware.js";
import * as adminController from "../controllers/admin.controller.js";

const router = Router();

/**
 * Admin Routes - Protected reporting and dashboard endpoints
 *
 * WHY admin-only access:
 * - Reports contain sensitive business metrics (revenue, user counts, etc.)
 * - Performance impact: Aggregations can be expensive on large datasets
 * - Security: Prevent unauthorized access to business intelligence
 *
 * All routes require:
 * 1. verifyJWT - Ensures user is authenticated
 * 2. requireAdmin - Ensures user has ADMIN role
 */

// ============ Individual Reports ============

/**
 * GET /api/v1/admin/reports/bookings
 * Query params: startDate, endDate, status
 * Returns: Total bookings, breakdown by status, 30-day trend
 */
router.get(
  "/reports/bookings",
  verifyJWT,
  requireAdmin,
  adminController.getTotalBookingsReport
);

/**
 * GET /api/v1/admin/reports/peak-hours
 * Query params: startDate, endDate
 * Returns: Hours ranked by booking volume, popular days per hour
 */
router.get(
  "/reports/peak-hours",
  verifyJWT,
  requireAdmin,
  adminController.getPeakBookingHoursReport
);

/**
 * GET /api/v1/admin/reports/slot-utilization
 * Query params: startDate, endDate, appointmentTypeId
 * Returns: Utilization rate, empty/full slots, distribution by brackets
 */
router.get(
  "/reports/slot-utilization",
  verifyJWT,
  requireAdmin,
  adminController.getSlotUtilizationReport
);

/**
 * GET /api/v1/admin/reports/users
 * Returns: User counts by role, email verification status, registration trend
 */
router.get(
  "/reports/users",
  verifyJWT,
  requireAdmin,
  adminController.getUserStatisticsReport
);

/**
 * GET /api/v1/admin/reports/revenue
 * Query params: startDate, endDate, status
 * Returns: Revenue by status, 30-day trend, payment gateway breakdown
 */
router.get(
  "/reports/revenue",
  verifyJWT,
  requireAdmin,
  adminController.getRevenueReport
);

/**
 * GET /api/v1/admin/reports/booking-intents
 * Returns: Intent status breakdown, conversion rate, expiration rate
 */
router.get(
  "/reports/booking-intents",
  verifyJWT,
  requireAdmin,
  adminController.getBookingIntentsReport
);

/**
 * GET /api/v1/admin/reports/providers
 * Query params: startDate, endDate
 * Returns: Provider utilization stats (busiest providers, capacity usage)
 */
router.get(
  "/reports/providers",
  verifyJWT,
  requireAdmin,
  adminController.getProviderUtilizationReport
);

// ============ Comprehensive Dashboard ============

/**
 * GET /api/v1/admin/dashboard
 * Query params: startDate, endDate
 * Returns: All reports combined in one response
 * WHY: Reduces HTTP round-trips, optimizes dashboard loading
 */
router.get(
  "/dashboard",
  verifyJWT,
  requireAdmin,
  adminController.getDashboardOverview
);

export default router;
