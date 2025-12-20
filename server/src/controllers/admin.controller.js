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

/**
 * ============================================
 * USER MANAGEMENT (ADMIN)
 * ============================================
 */

/**
 * @route GET /api/v1/admin/users
 * @desc Get all users with filters and pagination
 * @access Admin only
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  const { role, isActive, isEmailVerified, search, page, limit } = req.query;

  const filters = {};
  if (role) filters.role = role;
  if (isActive !== undefined) filters.isActive = isActive;
  if (isEmailVerified !== undefined) filters.isEmailVerified = isEmailVerified;
  if (search) filters.search = search;
  if (page) filters.page = page;
  if (limit) filters.limit = limit;

  const data = await adminService.getAllUsers(filters);

  res
    .status(200)
    .json(new ApiResponse(200, data, "Users retrieved successfully"));
});

/**
 * @route GET /api/v1/admin/users/:id
 * @desc Get user details by ID
 * @access Admin only
 */
export const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const data = await adminService.getUserDetails(id);

  res
    .status(200)
    .json(new ApiResponse(200, data, "User details retrieved successfully"));
});

/**
 * @route PUT /api/v1/admin/users/:id/activate
 * @desc Activate user account
 * @access Admin only
 */
export const activateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await adminService.activateUser(id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "User activated successfully"));
});

/**
 * @route PUT /api/v1/admin/users/:id/deactivate
 * @desc Deactivate user account
 * @access Admin only
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await adminService.deactivateUser(id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "User deactivated successfully"));
});

/**
 * @route PUT /api/v1/admin/users/:id/role
 * @desc Update user role
 * @access Admin only
 */
export const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role) {
    throw new ApiError(400, "Role is required");
  }

  const user = await adminService.updateUserRole(id, role);

  res
    .status(200)
    .json(new ApiResponse(200, user, "User role updated successfully"));
});

/**
 * ============================================
 * BOOKING MANAGEMENT
 * ============================================
 */

/**
 * @route GET /api/v1/admin/bookings
 * @desc Get all bookings with filters
 * @access Admin only
 */
export const getAllBookings = asyncHandler(async (req, res) => {
  const { status, userId, appointmentTypeId, startDate, endDate, page, limit } =
    req.query;

  const result = await adminService.getAllBookings({
    status,
    userId,
    appointmentTypeId,
    startDate,
    endDate,
    page,
    limit,
  });

  res
    .status(200)
    .json(new ApiResponse(200, result, "Bookings fetched successfully"));
});
/**
 * ============================================
 * PROVIDER MANAGEMENT
 * ============================================
 */

/**
 * @route GET /api/v1/admin/providers
 * @desc Get all providers (users with ORGANISER role)
 * @access Admin only
 */
export const getAllProviders = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const result = await adminService.getAllProviders({ search, page, limit });

  res
    .status(200)
    .json(new ApiResponse(200, result, "Providers fetched successfully"));
});
/**
 * @route GET /api/v1/admin/bookings/:id
 * @desc Get booking details by ID
 * @access Admin only
 */
export const getBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const booking = await adminService.getBookingDetails(id);

  res
    .status(200)
    .json(
      new ApiResponse(200, booking, "Booking details fetched successfully")
    );
});
