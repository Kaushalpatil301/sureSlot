import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as adminService from "../services/admin.service.js";

/**
 * Admin Controller - Thin HTTP layer for reporting endpoints
 *
 * WHY thin controllers:
 * - Separation of concerns (HTTP vs business logic)
 * - Business logic in services can be reused elsewhere
 * - Controllers only parse requests and format responses
 * - Makes testing easier (test services without HTTP layer)
 */

/**
 * @route GET /api/v1/admin/reports/bookings
 * @desc Get total bookings with breakdown by status and trend
 * @access Admin only
 */
export const getTotalBookingsReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, status } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (status) filters.status = status;

  const data = await adminService.getTotalBookings(filters);

  res
    .status(200)
    .json(
      new ApiResponse(200, data, "Total bookings report retrieved successfully")
    );
});

/**
 * @route GET /api/v1/admin/reports/peak-hours
 * @desc Get peak booking hours analysis
 * @access Admin only
 */
export const getPeakBookingHoursReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;

  const data = await adminService.getPeakBookingHours(filters);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        data,
        "Peak booking hours report retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/admin/reports/slot-utilization
 * @desc Get slot utilization metrics
 * @access Admin only
 */
export const getSlotUtilizationReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, appointmentTypeId } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (appointmentTypeId) filters.appointmentTypeId = appointmentTypeId;

  const data = await adminService.getSlotUtilization(filters);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        data,
        "Slot utilization report retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/admin/reports/users
 * @desc Get user statistics and metrics
 * @access Admin only
 */
export const getUserStatisticsReport = asyncHandler(async (req, res) => {
  const data = await adminService.getUserStatistics();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        data,
        "User statistics report retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/admin/reports/revenue
 * @desc Get revenue statistics from payments
 * @access Admin only
 */
export const getRevenueReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, status } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (status) filters.status = status;

  const data = await adminService.getRevenueStatistics(filters);

  res
    .status(200)
    .json(new ApiResponse(200, data, "Revenue report retrieved successfully"));
});

/**
 * @route GET /api/v1/admin/reports/booking-intents
 * @desc Get booking intent metrics (payment funnel analysis)
 * @access Admin only
 */
export const getBookingIntentsReport = asyncHandler(async (req, res) => {
  const data = await adminService.getBookingIntentStatistics();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        data,
        "Booking intents report retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/admin/reports/providers
 * @desc Get provider utilization metrics
 * @access Admin only
 */
export const getProviderUtilizationReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;

  const data = await adminService.getProviderUtilization(filters);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        data,
        "Provider utilization report retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/admin/dashboard
 * @desc Get comprehensive dashboard overview (all metrics in one call)
 * @access Admin only
 */
export const getDashboardOverview = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;

  // WHY single endpoint: Reduces HTTP round-trips for dashboard loading
  // Frontend makes 1 request instead of 7 separate requests
  const data = await adminService.getDashboardOverview(filters);

  res
    .status(200)
    .json(
      new ApiResponse(200, data, "Dashboard overview retrieved successfully")
    );
});
