import { Booking } from "../models/booking.model.js";
import { Slot } from "../models/slot.model.js";
import { User } from "../models/user.model.js";
import { Payment } from "../models/payment.model.js";
import { BookingIntent } from "../models/bookingIntent.model.js";
import { ApiError } from "../utils/api-error.js";

/**
 * Admin Service - Real-time reporting via MongoDB aggregation
 *
 * WHY reports are derived, not stored:
 * 1. SINGLE SOURCE OF TRUTH: Data lives in operational tables (bookings, slots, payments)
 *    - Storing reports creates data duplication
 *    - Changes to operational data would require updating report tables (complexity + bugs)
 *    - Aggregations always reflect current state (no staleness)
 *
 * 2. FLEXIBILITY: Ad-hoc queries without schema changes
 *    - Can filter by date range, appointment type, user, status on-the-fly
 *    - No need to pre-compute every possible report combination
 *    - Easy to add new metrics without migrations
 *
 * 3. STORAGE EFFICIENCY: No redundant data
 *    - Reports would consume additional disk space
 *    - Historical reports would grow indefinitely
 *    - Aggregation pipelines are memory-efficient (can use indexes)
 *
 * 4. SIMPLICITY: One less thing to maintain
 *    - No background jobs to update report tables
 *    - No synchronization concerns between operational and report data
 *    - Easier to debug (one place to look for truth)
 *
 * WHEN to store reports:
 * - If queries become too slow (create materialized views or scheduled snapshots)
 * - If you need point-in-time historical snapshots (daily/weekly rollups)
 * - If aggregations hit performance limits (millions of bookings)
 *
 * For most appointment systems, real-time aggregation is sufficient.
 */

/**
 * Get total bookings count with optional filters
 * @param {Object} filters - Optional filters (startDate, endDate, status, appointmentTypeId)
 * @returns {Promise<Object>} Total count and breakdown by status
 */
export const getTotalBookings = async (filters = {}) => {
  const matchStage = {};

  // WHY filter by createdAt: Allows time-range queries (e.g., "bookings this month")
  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate)
      matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
  }

  if (filters.status) {
    matchStage.status = filters.status;
  }

  // WHY use aggregation instead of .count(): We want breakdown by status in one query
  const pipeline = [
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $facet: {
        // Total count across all statuses
        total: [{ $count: "count" }],
        // Breakdown by status
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        // Recent bookings trend (last 30 days, grouped by day)
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
    trend: result.trend, // Array of { _id: "2025-12-20", count: 15 }
  };
};

/**
 * Get peak booking hours - identifies busiest times of day
 * @param {Object} filters - Optional filters (startDate, endDate, status)
 * @returns {Promise<Array>} Hours ranked by booking volume
 */
export const getPeakBookingHours = async (filters = {}) => {
  const matchStage = { status: "CONFIRMED" }; // Only count confirmed bookings

  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate)
      matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
  }

  // WHY join with slots: We need the actual appointment time, not booking creation time
  // A booking created at 10 AM for a 3 PM slot should count toward 3 PM peak
  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "slots", // Collection name (mongoose pluralizes model name)
        localField: "slotId",
        foreignField: "_id",
        as: "slot",
      },
    },
    { $unwind: "$slot" },
    {
      $project: {
        // Extract hour from slot startTime
        hour: { $hour: "$slot.startTime" },
        dayOfWeek: { $dayOfWeek: "$slot.startTime" }, // 1 = Sunday, 7 = Saturday
      },
    },
    {
      $group: {
        _id: "$hour",
        count: { $sum: 1 },
        // Also track which days this hour is popular
        days: { $addToSet: "$dayOfWeek" },
      },
    },
    { $sort: { count: -1 } }, // Busiest hours first
    { $limit: 24 }, // Max 24 hours in a day
  ];

  const results = await Booking.aggregate(pipeline);

  // WHY format output: Hour numbers (0-23) are not user-friendly
  return results.map((item) => ({
    hour: item._id,
    hourFormatted: formatHour(item._id),
    bookingCount: item.count,
    popularDays: item.days.map(formatDayOfWeek).sort(),
  }));
};

/**
 * Get slot utilization metrics - shows how well slots are being used
 * @param {Object} filters - Optional filters (startDate, endDate, appointmentTypeId)
 * @returns {Promise<Object>} Utilization statistics
 */
export const getSlotUtilization = async (filters = {}) => {
  const matchStage = {
    status: "AVAILABLE", // Only analyze active slots
  };

  // WHY filter by startTime instead of createdAt: We care about upcoming/recent slots
  if (filters.startDate || filters.endDate) {
    matchStage.startTime = {};
    if (filters.startDate)
      matchStage.startTime.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.startTime.$lte = new Date(filters.endDate);
  }

  if (filters.appointmentTypeId) {
    matchStage.appointmentTypeId = filters.appointmentTypeId;
  }

  // WHY calculate utilization: Shows efficiency of slot allocation
  // High utilization = good (slots being used)
  // Low utilization = waste (too many slots generated)
  const pipeline = [
    { $match: matchStage },
    {
      $project: {
        capacity: 1,
        bookedCount: 1,
        // Calculate utilization percentage per slot
        utilizationRate: {
          $cond: [
            { $eq: ["$capacity", 0] },
            0,
            { $multiply: [{ $divide: ["$bookedCount", "$capacity"] }, 100] },
          ],
        },
        // Categorize slots
        isFullyBooked: { $gte: ["$bookedCount", "$capacity"] },
        isEmpty: { $eq: ["$bookedCount", 0] },
      },
    },
    {
      $facet: {
        // Overall statistics
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
        // Distribution by utilization brackets
        distribution: [
          {
            $bucket: {
              groupBy: "$utilizationRate",
              boundaries: [0, 25, 50, 75, 100, 101], // 0-25%, 25-50%, 50-75%, 75-100%, 100%+
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

/**
 * Get user statistics - tracks user behavior and activity
 * @returns {Promise<Object>} User metrics
 */
export const getUserStatistics = async () => {
  const pipeline = [
    {
      $facet: {
        // Total users by role
        byRole: [
          {
            $group: {
              _id: "$role",
              count: { $sum: 1 },
            },
          },
        ],
        // Email verification status
        emailStatus: [
          {
            $group: {
              _id: "$isEmailVerified",
              count: { $sum: 1 },
            },
          },
        ],
        // Recent registrations (last 30 days)
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

/**
 * Get revenue statistics from payments
 * @param {Object} filters - Optional filters (startDate, endDate, status)
 * @returns {Promise<Object>} Revenue metrics
 */
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
        // Total revenue by status
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
        // Revenue trend (last 30 days)
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
        // Payment gateway breakdown
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

/**
 * Get booking intent metrics - shows payment funnel performance
 * @returns {Promise<Object>} Intent statistics
 */
export const getBookingIntentStatistics = async () => {
  const pipeline = [
    {
      $facet: {
        // Intent status breakdown
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$amount" },
            },
          },
        ],
        // Conversion rate calculation
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

/**
 * Get comprehensive dashboard data in one call
 * WHY combine queries: Reduces HTTP round-trips for dashboard loading
 * @param {Object} filters - Global filters applied to all queries
 * @returns {Promise<Object>} All dashboard metrics
 */
export const getDashboardOverview = async (filters = {}) => {
  // WHY parallel execution: These queries are independent, no need to await sequentially
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

/**
 * Get provider utilization metrics
 * WHY: Track which providers are busiest, identify capacity issues
 * @param {Object} filters - Optional filters (startDate, endDate)
 * @returns {Promise<Array>} Provider utilization stats
 */
export const getProviderUtilization = async (filters = {}) => {
  const matchStage = {};

  if (filters.startDate || filters.endDate) {
    matchStage.startTime = {};
    if (filters.startDate)
      matchStage.startTime.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.startTime.$lte = new Date(filters.endDate);
  }

  // WHY filter by providerId existence: Only analyze provider-assigned slots
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

// ============ Helper Functions ============

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

/**
 * ============================================
 * USER MANAGEMENT (ADMIN)
 * ============================================
 */

/**
 * Get all users with filters and pagination
 * @param {Object} filters - role, isActive, isEmailVerified, search, page, limit
 * @returns {Promise<Object>} Paginated users list
 */
export const getAllUsers = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  // Build match stage
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

  // Search by name, email, or username
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

/**
 * Activate a user account
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
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

/**
 * Deactivate a user account
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
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

/**
 * Update user role
 * @param {String} userId - User ID
 * @param {String} newRole - New role (USER/ORGANISER/ADMIN)
 * @returns {Promise<Object>} Updated user
 */
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

/**
 * Get user details by ID (admin view)
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User with booking stats
 */
export const getUserDetails = async (userId) => {
  const user = await User.findById(userId).select(
    "-password -refreshToken -forgotPasswordToken -emailVerificationToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Get booking stats for this user
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

/**
 * ============================================
 * BOOKING MANAGEMENT (ADMIN)
 * ============================================
 */

/**
 * Get all bookings with filters and pagination (admin view)
 * @param {Object} filters - status, userId, appointmentTypeId, startDate, endDate, page, limit
 * @returns {Promise<Object>} Paginated bookings with details
 */
export const getAllBookings = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  // Build match stage
  const matchStage = {};

  if (filters.status) {
    matchStage.status = filters.status;
  }

  if (filters.userId) {
    matchStage.userId = mongoose.Types.ObjectId(filters.userId);
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

    // Filter by appointmentTypeId if provided
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

    // Filter by slot time range
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

    // Lookup appointment type
    {
      $lookup: {
        from: "appointmenttypes",
        localField: "slot.appointmentTypeId",
        foreignField: "_id",
        as: "appointmentType",
      },
    },
    { $unwind: "$appointmentType" },

    // Lookup user (customer)
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    // Lookup provider if exists
    {
      $lookup: {
        from: "users",
        localField: "slot.providerId",
        foreignField: "_id",
        as: "provider",
      },
    },

    // Sort by slot start time (most recent first)
    { $sort: { "slot.startTime": -1 } },

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

/**
 * Get booking details by ID (admin view)
 * @param {String} bookingId - Booking ID
 * @returns {Promise<Object>} Detailed booking information
 */
export const getBookingDetails = async (bookingId) => {
  const pipeline = [
    { $match: { _id: mongoose.Types.ObjectId(bookingId) } },

    // Lookup slot
    {
      $lookup: {
        from: "slots",
        localField: "slotId",
        foreignField: "_id",
        as: "slot",
      },
    },
    { $unwind: "$slot" },

    // Lookup appointment type
    {
      $lookup: {
        from: "appointmenttypes",
        localField: "slot.appointmentTypeId",
        foreignField: "_id",
        as: "appointmentType",
      },
    },
    { $unwind: "$appointmentType" },

    // Lookup user
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    // Lookup provider
    {
      $lookup: {
        from: "users",
        localField: "slot.providerId",
        foreignField: "_id",
        as: "provider",
      },
    },

    // Lookup payment
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

/**
 * ============================================
 * PROVIDER MANAGEMENT (ADMIN/ORGANISER)
 * ============================================
 */

/**
 * Get all providers (users with ORGANISER role)
 * @param {Object} filters - search, page, limit
 * @returns {Promise<Object>} Paginated list of providers
 */
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
