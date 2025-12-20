import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as userService from "../services/user.service.js";

/**
 * User Controller - Profile and booking management
 */

/**
 * @route GET /api/v1/users/me
 * @desc Get current user's profile
 * @access Private (authenticated users)
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await userService.getUserProfile(req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "Profile retrieved successfully"));
});

/**
 * @route PUT /api/v1/users/me
 * @desc Update current user's profile
 * @access Private (authenticated users)
 */
export const updateMyProfile = asyncHandler(async (req, res) => {
  const updates = req.body;
  const user = await userService.updateUserProfile(req.user._id, updates);

  res
    .status(200)
    .json(new ApiResponse(200, user, "Profile updated successfully"));
});

/**
 * @route GET /api/v1/users/me/bookings
 * @desc Get current user's bookings
 * @access Private (authenticated users)
 * @query status - Filter by booking status (PENDING/CONFIRMED/CANCELLED)
 * @query upcoming - Boolean, show only upcoming bookings
 * @query past - Boolean, show only past bookings
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 10)
 */
export const getMyBookings = asyncHandler(async (req, res) => {
  const { status, upcoming, past, page, limit } = req.query;

  const filters = {};
  if (status) filters.status = status;
  if (upcoming === "true") filters.upcoming = true;
  if (past === "true") filters.past = true;
  if (page) filters.page = page;
  if (limit) filters.limit = limit;

  const data = await userService.getUserBookings(req.user._id, filters);

  res
    .status(200)
    .json(new ApiResponse(200, data, "Bookings retrieved successfully"));
});
