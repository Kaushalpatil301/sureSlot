import { User } from "../models/user.model.js";
import { Booking } from "../models/booking.model.js";
import { ApiError } from "../utils/api-error.js";

/**
 * User Service - User profile and booking history
 *
 * WHY separate from auth service:
 * - Auth handles login/signup/token management
 * - User service handles profile operations
 * - Clear separation of concerns
 */

/**
 * Get user profile by ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User profile (password excluded)
 */
export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

/**
 * Update user profile
 * @param {String} userId - User ID
 * @param {Object} updates - Fields to update (fullname, avatar, etc.)
 * @returns {Promise<Object>} Updated user profile
 */
export const updateUserProfile = async (userId, updates) => {
  // WHY whitelist allowed fields: Prevent users from updating sensitive fields
  const allowedUpdates = ["fullname", "avatar"];
  const filteredUpdates = {};

  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: filteredUpdates },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

/**
 * Get user's bookings with filtering
 * @param {String} userId - User ID
 * @param {Object} filters - Optional filters (status, upcoming, past, page, limit)
 * @returns {Promise<Object>} Paginated bookings with metadata
 */
export const getUserBookings = async (userId, filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 10;
  const skip = (page - 1) * limit;

  // Build match stage
  const matchStage = { userId };

  // Filter by status
  if (filters.status) {
    matchStage.status = filters.status;
  }

  // Filter by time (upcoming vs past)
  if (filters.upcoming || filters.past) {
    const now = new Date();

    if (filters.upcoming) {
      // Upcoming: slots that start in the future and booking is not cancelled
      matchStage.status = { $ne: "CANCELLED" };
      // We'll filter by slot.startTime in the pipeline
    }

    if (filters.past) {
      // Past: slots that already ended OR booking is cancelled
      // We'll filter by slot.startTime in the pipeline
    }
  }

  // Build aggregation pipeline
  const pipeline = [
    { $match: matchStage },

    // Lookup slot details
    {
      $lookup: {
        from: "slots",
        localField: "slotId",
        foreignField: "_id",
        as: "slot",
      },
    },
    { $unwind: "$slot" },

    // Lookup appointment type details
    {
      $lookup: {
        from: "appointmenttypes",
        localField: "slot.appointmentTypeId",
        foreignField: "_id",
        as: "appointmentType",
      },
    },
    { $unwind: "$appointmentType" },

    // Filter by slot time (upcoming/past)
    ...(filters.upcoming
      ? [{ $match: { "slot.startTime": { $gte: new Date() } } }]
      : []),
    ...(filters.past
      ? [
          {
            $match: {
              $or: [
                { "slot.endTime": { $lt: new Date() } },
                { status: "CANCELLED" },
              ],
            },
          },
        ]
      : []),

    // Sort by slot start time (newest first for past, soonest first for upcoming)
    {
      $sort: filters.past ? { "slot.startTime": -1 } : { "slot.startTime": 1 },
    },

    // Facet for pagination
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              status: 1,
              answers: 1,
              notes: 1,
              createdAt: 1,
              updatedAt: 1,
              slot: {
                _id: 1,
                startTime: 1,
                endTime: 1,
                duration: 1,
                capacity: 1,
                bookedCount: 1,
              },
              appointmentType: {
                _id: 1,
                name: 1,
                description: 1,
                duration: 1,
                price: 1,
                currency: 1,
                color: 1,
              },
            },
          },
        ],
      },
    },
  ];

  const [result] = await Booking.aggregate(pipeline);

  const total = result.metadata[0]?.total || 0;
  const bookings = result.data;

  return {
    bookings,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  };
};
