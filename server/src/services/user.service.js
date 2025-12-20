import { User } from "../models/user.model.js";
import { Booking } from "../models/booking.model.js";
import { ApiError } from "../utils/api-error.js";

export const getUserProfile = async (userId) => {
  const user = await User.findById(userId).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

export const updateUserProfile = async (userId, updates) => {
  
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

export const getUserBookings = async (userId, filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 10;
  const skip = (page - 1) * limit;

  const matchStage = { userId };

  if (filters.status) {
    matchStage.status = filters.status;
  }

  if (filters.upcoming || filters.past) {
    const now = new Date();

    if (filters.upcoming) {
      
      matchStage.status = { $ne: "CANCELLED" };
      
    }

    if (filters.past) {

    }
  }

  const pipeline = [
    { $match: matchStage },

    {
      $lookup: {
        from: "slots",
        localField: "slotId",
        foreignField: "_id",
        as: "slot",
      },
    },
    { $unwind: "$slot" },

    {
      $lookup: {
        from: "appointmenttypes",
        localField: "slot.appointmentTypeId",
        foreignField: "_id",
        as: "appointmentType",
      },
    },
    { $unwind: "$appointmentType" },

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

    {
      $sort: filters.past ? { "slot.startTime": -1 } : { "slot.startTime": 1 },
    },

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
