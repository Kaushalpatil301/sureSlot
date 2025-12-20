import { Router } from "express";
import {
  getAvailability,
  checkAvailability,
  getCalendarAvailability,
} from "../controllers/availability.controller.js";

/**
 * Availability Routes - Public, read-only endpoints
 *
 * WHY no authentication:
 * - Availability is public information
 * - Anyone should be able to check available times
 * - Authentication happens at booking time, not browsing
 * - Reduces friction in the booking funnel
 *
 * WHY no rate limiting (or very lenient):
 * - Read-only operations are safe
 * - No state mutations to abuse
 * - Can be cached aggressively
 * - Encourage users to check availability freely
 */

const router = Router();

/**
 * GET /api/v1/availability
 *
 * Main availability endpoint with flexible querying
 *
 * Query params:
 * - appointmentTypeId (required): The appointment type to check
 * - date (optional): Single date YYYY-MM-DD
 * - startDate, endDate (optional): Date range YYYY-MM-DD
 * - grouped (optional): "true" to group by date
 *
 * Examples:
 * - /availability?appointmentTypeId=123&date=2025-12-20
 * - /availability?appointmentTypeId=123&startDate=2025-12-20&endDate=2025-12-27
 * - /availability?appointmentTypeId=123&startDate=2025-12-20&endDate=2025-12-27&grouped=true
 */
router.get("/", getAvailability);

/**
 * GET /api/v1/availability/check
 *
 * Quick boolean check for availability
 *
 * Query params:
 * - appointmentTypeId (required)
 * - date (required): YYYY-MM-DD
 *
 * Returns: { hasAvailability: boolean }
 *
 * WHY separate route:
 * - Faster for calendar highlighting
 * - No slot data transfer
 * - Clear semantic intent
 */
router.get("/check", checkAvailability);

/**
 * GET /api/v1/availability/calendar
 *
 * Calendar-optimized grouped availability
 *
 * Query params:
 * - appointmentTypeId (required)
 * - startDate (required): YYYY-MM-DD
 * - endDate (required): YYYY-MM-DD
 *
 * Returns: Slots grouped by date with metadata
 *
 * WHY dedicated route:
 * - Pre-formatted for calendar UIs
 * - Includes helpful metadata
 * - Reduces client-side processing
 */
router.get("/calendar", getCalendarAvailability);

export default router;
