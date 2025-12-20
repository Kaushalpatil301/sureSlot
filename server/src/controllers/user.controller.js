import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as userService from "../services/user.service.js";

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await userService.getUserProfile(req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, user, "Profile retrieved successfully"));
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const updates = req.body;
  const user = await userService.updateUserProfile(req.user._id, updates);

  res
    .status(200)
    .json(new ApiResponse(200, user, "Profile updated successfully"));
});

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
