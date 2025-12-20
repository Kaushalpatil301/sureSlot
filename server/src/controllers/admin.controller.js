import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as adminService from "../services/admin.service.js";

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

export const getDashboardOverview = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;

  const data = await adminService.getDashboardOverview(filters);

  res
    .status(200)
    .json(
      new ApiResponse(200, data, "Dashboard overview retrieved successfully")
    );
});

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

export const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const data = await adminService.getUserDetails(id);

  res
    .status(200)
    .json(new ApiResponse(200, data, "User details retrieved successfully"));
});

export const activateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await adminService.activateUser(id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "User activated successfully"));
});

export const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await adminService.deactivateUser(id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "User deactivated successfully"));
});

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

export const getAllProviders = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const result = await adminService.getAllProviders({ search, page, limit });

  res
    .status(200)
    .json(new ApiResponse(200, result, "Providers fetched successfully"));
});

export const getBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const booking = await adminService.getBookingDetails(id);

  res
    .status(200)
    .json(
      new ApiResponse(200, booking, "Booking details fetched successfully")
    );
});
