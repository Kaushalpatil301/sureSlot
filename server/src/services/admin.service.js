import { Booking } from "../models/booking.model.js";
import { Slot } from "../models/slot.model.js";
import { User } from "../models/user.model.js";
import { Payment } from "../models/payment.model.js";
import { BookingIntent } from "../models/bookingIntent.model.js";
import { ApiError } from "../utils/api-error.js";

export const getTotalBookings = async (filters = {}) => {
  const matchStage = {};

  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate)
      matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
  }

  if (filters.status) {
    matchStage.status = filters.status;
  }

  const pipeline = [
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $facet: {
        
        total: [{ $count: "count" }],
        
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        
        trend: [
          {
            $match: {
              createdAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];

  const [result] = await Booking.aggregate(pipeline);

  return {
    total: result.total[0]?.count || 0,
    byStatus: result.byStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    trend: result.trend, 
  };
};

export const getPeakBookingHours = async (filters = {}) => {
  const matchStage = { status: "CONFIRMED" }; 

  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate)
      matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
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
      $project: {
        
        hour: { $hour: "$slot.startTime" },
        dayOfWeek: { $dayOfWeek: "$slot.startTime" }, 
      },
    },
    {
      $group: {
        _id: "$hour",
        count: { $sum: 1 },
        
        days: { $addToSet: "$dayOfWeek" },
      },
    },
    { $sort: { count: -1 } }, 
    { $limit: 24 }, 
  ];

  const results = await Booking.aggregate(pipeline);

  return results.map((item) => ({
    hour: item._id,
    hourFormatted: formatHour(item._id),
    bookingCount: item.count,
    popularDays: item.days.map(formatDayOfWeek).sort(),
  }));
};

export const getSlotUtilization = async (filters = {}) => {
  const matchStage = {
    status: "AVAILABLE", 
  };

  if (filters.startDate || filters.endDate) {
    matchStage.startTime = {};
    if (filters.startDate)
      matchStage.startTime.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.startTime.$lte = new Date(filters.endDate);
  }

  if (filters.appointmentTypeId) {
    matchStage.appointmentTypeId = filters.appointmentTypeId;
  }

  const pipeline = [
    { $match: matchStage },
    {
      $project: {
        capacity: 1,
        bookedCount: 1,
        
        utilizationRate: {
          $cond: [
            { $eq: ["$capacity", 0] },
            0,
            { $multiply: [{ $divide: ["$bookedCount", "$capacity"] }, 100] },
          ],
        },
        
        isFullyBooked: { $gte: ["$bookedCount", "$capacity"] },
        isEmpty: { $eq: ["$bookedCount", 0] },
      },
    },
    {
      $facet: {
        
        overall: [
          {
            $group: {
              _id: null,
              totalSlots: { $sum: 1 },
              totalCapacity: { $sum: "$capacity" },
              totalBooked: { $sum: "$bookedCount" },
              fullyBookedSlots: {
                $sum: { $cond: ["$isFullyBooked", 1, 0] },
              },
              emptySlots: {
                $sum: { $cond: ["$isEmpty", 1, 0] },
              },
              avgUtilization: { $avg: "$utilizationRate" },
            },
          },
        ],
        
        distribution: [
          {
            $bucket: {
              groupBy: "$utilizationRate",
              boundaries: [0, 25, 50, 75, 100, 101], 
              default: "Other",
              output: {
                count: { $sum: 1 },
                avgUtilization: { $avg: "$utilizationRate" },
              },
            },
          },
        ],
      },
    },
  ];

  const [result] = await Slot.aggregate(pipeline);
  const overall = result.overall[0] || {};

  return {
    totalSlots: overall.totalSlots || 0,
    totalCapacity: overall.totalCapacity || 0,
    totalBooked: overall.totalBooked || 0,
    fullyBookedSlots: overall.fullyBookedSlots || 0,
    emptySlots: overall.emptySlots || 0,
    averageUtilization: overall.avgUtilization?.toFixed(2) || "0.00",
    utilizationRate:
      overall.totalCapacity > 0
        ? ((overall.totalBooked / overall.totalCapacity) * 100).toFixed(2)
        : "0.00",
    distribution: result.distribution.map((item) => ({
      range: formatUtilizationRange(item._id),
      slotCount: item.count,
      avgUtilization: item.avgUtilization?.toFixed(2) || "0.00",
    })),
  };
};

export const getUserStatistics = async () => {
  const pipeline = [
    {
      $facet: {
        
        byRole: [
          {
            $group: {
              _id: "$role",
              count: { $sum: 1 },
            },
          },
        ],
        
        emailStatus: [
          {
            $group: {
              _id: "$isEmailVerified",
              count: { $sum: 1 },
            },
          },
        ],
        
        recentRegistrations: [
          {
            $match: {
              createdAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];

  const [result] = await User.aggregate(pipeline);

  return {
    byRole: result.byRole.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    emailVerified:
      result.emailStatus.find((item) => item._id === true)?.count || 0,
    emailNotVerified:
      result.emailStatus.find((item) => item._id === false)?.count || 0,
    recentRegistrations: result.recentRegistrations,
  };
};

export const getRevenueStatistics = async (filters = {}) => {
  const matchStage = {};

  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate)
      matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
  }

  if (filters.status) {
    matchStage.status = filters.status;
  }

  const pipeline = [
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $facet: {
        
        byStatus: [
          {
            $group: {
              _id: "$status",
              totalAmount: { $sum: "$amount" },
              count: { $sum: 1 },
              avgAmount: { $avg: "$amount" },
            },
          },
        ],
        
        trend: [
          {
            $match: {
              createdAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              totalAmount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        
        byGateway: [
          {
            $group: {
              _id: "$paymentGateway",
              totalAmount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ];

  const [result] = await Payment.aggregate(pipeline);

  return {
    byStatus: result.byStatus.reduce((acc, item) => {
      acc[item._id] = {
        totalAmount: item.totalAmount,
        count: item.count,
        avgAmount: item.avgAmount?.toFixed(2) || "0.00",
      };
      return acc;
    }, {}),
    trend: result.trend,
    byGateway: result.byGateway.reduce((acc, item) => {
      acc[item._id] = {
        totalAmount: item.totalAmount,
        count: item.count,
      };
      return acc;
    }, {}),
  };
};

export const getBookingIntentStatistics = async () => {
  const pipeline = [
    {
      $facet: {
        
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$amount" },
            },
          },
        ],
        
        conversionMetrics: [
          {
            $group: {
              _id: null,
              totalIntents: { $sum: 1 },
              confirmedIntents: {
                $sum: { $cond: [{ $eq: ["$status", "CONFIRMED"] }, 1, 0] },
              },
              expiredIntents: {
                $sum: { $cond: [{ $eq: ["$status", "EXPIRED"] }, 1, 0] },
              },
            },
          },
        ],
      },
    },
  ];

  const [result] = await BookingIntent.aggregate(pipeline);
  const metrics = result.conversionMetrics[0] || {};

  return {
    byStatus: result.byStatus.reduce((acc, item) => {
      acc[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount,
      };
      return acc;
    }, {}),
    conversionRate:
      metrics.totalIntents > 0
        ? ((metrics.confirmedIntents / metrics.totalIntents) * 100).toFixed(2)
        : "0.00",
    expirationRate:
      metrics.totalIntents > 0
        ? ((metrics.expiredIntents / metrics.totalIntents) * 100).toFixed(2)
        : "0.00",
  };
};

export const getDashboardOverview = async (filters = {}) => {
  
  const [bookings, peakHours, utilization, users, revenue, intents, providers] =
    await Promise.all([
      getTotalBookings(filters),
      getPeakBookingHours(filters),
      getSlotUtilization(filters),
      getUserStatistics(),
      getRevenueStatistics(filters),
      getBookingIntentStatistics(),
      getProviderUtilization(filters),
    ]);

  return {
    bookings,
    peakHours,
    utilization,
    users,
    revenue,
    intents,
    providers,
    generatedAt: new Date().toISOString(),
  };
};

export const getProviderUtilization = async (filters = {}) => {
  const matchStage = {};

  if (filters.startDate || filters.endDate) {
    matchStage.startTime = {};
    if (filters.startDate)
      matchStage.startTime.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.startTime.$lte = new Date(filters.endDate);
  }

  matchStage.providerId = { $exists: true, $ne: null };

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: "$providerId",
        totalSlots: { $sum: 1 },
        totalCapacity: { $sum: "$capacity" },
        totalBooked: { $sum: "$bookedCount" },
        avgUtilization: {
          $avg: {
            $cond: [
              { $eq: ["$capacity", 0] },
              0,
              { $multiply: [{ $divide: ["$bookedCount", "$capacity"] }, 100] },
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "provider",
      },
    },
    { $unwind: "$provider" },
    {
      $project: {
        providerId: "$_id",
        providerName: "$provider.fullname",
        providerEmail: "$provider.email",
        totalSlots: 1,
        totalCapacity: 1,
        totalBooked: 1,
        utilizationRate: {
          $cond: [
            { $eq: ["$totalCapacity", 0] },
            0,
            {
              $multiply: [{ $divide: ["$totalBooked", "$totalCapacity"] }, 100],
            },
          ],
        },
        avgUtilization: 1,
      },
    },
    { $sort: { utilizationRate: -1 } },
  ];

  return await Slot.aggregate(pipeline);
};

function formatHour(hour) {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

function formatDayOfWeek(day) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[day - 1] || "Unknown";
}

function formatUtilizationRange(boundary) {
  if (boundary === "Other") return "Other";
  const ranges = {
    0: "0-25%",
    25: "25-50%",
    50: "50-75%",
    75: "75-100%",
    100: "100%+",
  };
  return ranges[boundary] || `${boundary}%+`;
}

export const getAllUsers = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  const matchStage = {};

  if (filters.role) {
    matchStage.role = filters.role;
  }

  if (filters.isActive !== undefined) {
    matchStage.isActive = filters.isActive === "true";
  }

  if (filters.isEmailVerified !== undefined) {
    matchStage.isEmailVerified = filters.isEmailVerified === "true";
  }

  if (filters.search) {
    matchStage.$or = [
      { fullname: { $regex: filters.search, $options: "i" } },
      { email: { $regex: filters.search, $options: "i" } },
      { username: { $regex: filters.search, $options: "i" } },
    ];
  }

  const total = await User.countDocuments(matchStage);

  const users = await User.find(matchStage)
    .select(
      "-password -refreshToken -forgotPasswordToken -emailVerificationToken"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  };
};

export const activateUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isActive: true },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

export const deactivateUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { isActive: false },
    { new: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

export const updateUserRole = async (userId, newRole) => {
  const validRoles = ["USER", "ORGANISER", "ADMIN"];

  if (!validRoles.includes(newRole)) {
    throw new ApiError(400, "Invalid role");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { role: newRole },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

export const getUserDetails = async (userId) => {
  const user = await User.findById(userId).select(
    "-password -refreshToken -forgotPasswordToken -emailVerificationToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const bookingStats = await Booking.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {};
  bookingStats.forEach((stat) => {
    stats[stat._id] = stat.count;
  });

  return {
    ...user.toObject(),
    bookingStats: {
      total: Object.values(stats).reduce((sum, count) => sum + count, 0),
      byStatus: stats,
    },
  };
};

export const getAllBookings = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  const matchStage = {};

  if (filters.status) {
    matchStage.status = filters.status;
  }

  if (filters.userId) {
    matchStage.userId = mongoose.Types.ObjectId(filters.userId);
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

    ...(filters.appointmentTypeId
      ? [
          {
            $match: {
              "slot.appointmentTypeId": mongoose.Types.ObjectId(
                filters.appointmentTypeId
              ),
            },
          },
        ]
      : []),

    ...(filters.startDate || filters.endDate
      ? [
          {
            $match: {
              "slot.startTime": {
                ...(filters.startDate && {
                  $gte: new Date(filters.startDate),
                }),
                ...(filters.endDate && { $lte: new Date(filters.endDate) }),
              },
            },
          },
        ]
      : []),

    {
      $lookup: {
        from: "appointmenttypes",
        localField: "slot.appointmentTypeId",
        foreignField: "_id",
        as: "appointmentType",
      },
    },
    { $unwind: "$appointmentType" },

    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    {
      $lookup: {
        from: "users",
        localField: "slot.providerId",
        foreignField: "_id",
        as: "provider",
      },
    },

    { $sort: { "slot.startTime": -1 } },

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
              },
              user: {
                _id: 1,
                fullname: 1,
                email: 1,
                username: 1,
                avatar: 1,
              },
              provider: {
                $cond: {
                  if: { $gt: [{ $size: "$provider" }, 0] },
                  then: {
                    _id: { $arrayElemAt: ["$provider._id", 0] },
                    fullname: { $arrayElemAt: ["$provider.fullname", 0] },
                    email: { $arrayElemAt: ["$provider.email", 0] },
                  },
                  else: null,
                },
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

export const getBookingDetails = async (bookingId) => {
  const pipeline = [
    { $match: { _id: mongoose.Types.ObjectId(bookingId) } },

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

    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    {
      $lookup: {
        from: "users",
        localField: "slot.providerId",
        foreignField: "_id",
        as: "provider",
      },
    },

    {
      $lookup: {
        from: "payments",
        localField: "_id",
        foreignField: "bookingId",
        as: "payments",
      },
    },

    {
      $project: {
        _id: 1,
        status: 1,
        answers: 1,
        notes: 1,
        createdAt: 1,
        updatedAt: 1,
        slot: 1,
        appointmentType: {
          _id: 1,
          name: 1,
          description: 1,
          duration: 1,
          price: 1,
          currency: 1,
          questions: 1,
        },
        user: {
          _id: 1,
          fullname: 1,
          email: 1,
          username: 1,
          avatar: 1,
          role: 1,
        },
        provider: {
          $cond: {
            if: { $gt: [{ $size: "$provider" }, 0] },
            then: {
              _id: { $arrayElemAt: ["$provider._id", 0] },
              fullname: { $arrayElemAt: ["$provider.fullname", 0] },
              email: { $arrayElemAt: ["$provider.email", 0] },
            },
            else: null,
          },
        },
        payments: 1,
      },
    },
  ];

  const [booking] = await Booking.aggregate(pipeline);

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  return booking;
};

export const getAllProviders = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  const query = { role: "ORGANISER", isActive: true };

  if (filters.search) {
    query.$or = [
      { fullname: { $regex: filters.search, $options: "i" } },
      { email: { $regex: filters.search, $options: "i" } },
      { username: { $regex: filters.search, $options: "i" } },
    ];
  }

  const [providers, total] = await Promise.all([
    User.find(query)
      .select("fullname email username avatar role createdAt")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(),
    User.countDocuments(query),
  ]);

  return {
    providers,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  };
};
