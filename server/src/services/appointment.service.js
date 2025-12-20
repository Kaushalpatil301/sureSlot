import { AppointmentType } from "../models/appointmentType.model.js";
import { Slot } from "../models/slot.model.js";
import { Booking } from "../models/booking.model.js";
import { ApiError } from "../utils/api-error.js";
import { validateWorkingHours } from "../utils/time.js";
import * as slotService from "./slot.service.js";
import crypto from "crypto";
import mongoose from "mongoose";

/**
 * Appointment Service - Manages AppointmentType lifecycle
 *
 * WHY this service exists:
 * - AppointmentType is the RULE ENGINE for the scheduling system
 * - Changes to appointment types trigger slot generation
 * - Centralized validation ensures data consistency
 * - Encapsulates complex publish/share logic
 */

/**
 * Create a new appointment type
 * WHY separate from publish: Draft → Review → Publish workflow
 */
export const createAppointmentType = async (userId, data) => {
  // Validate working hours
  const validation = validateWorkingHours(data.workingHours || {});
  if (!validation.valid) {
    throw new ApiError(400, `Invalid working hours: ${validation.error}`);
  }

  // WHY not published by default: Allows draft creation
  const appointmentType = new AppointmentType({
    ...data,
    userId,
    isPublished: false,
    isShareEnabled: false,
  });

  await appointmentType.save();
  return appointmentType;
};

/**
 * Update appointment type
 * WHY regenerate slots: Configuration changes must reflect in availability
 */
export const updateAppointmentType = async (
  appointmentTypeId,
  userId,
  data
) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  // Validate working hours if provided
  if (data.workingHours) {
    const validation = validateWorkingHours(data.workingHours);
    if (!validation.valid) {
      throw new ApiError(400, `Invalid working hours: ${validation.error}`);
    }
  }

  // WHY check critical fields: Duration/capacity changes need slot regeneration
  const criticalFieldsChanged =
    (data.duration && data.duration !== appointmentType.duration) ||
    (data.capacity && data.capacity !== appointmentType.capacity) ||
    (data.workingHours &&
      JSON.stringify(data.workingHours) !==
        JSON.stringify(appointmentType.getWorkingHours()));

  Object.assign(appointmentType, data);
  await appointmentType.save();

  // WHY conditional regeneration: Only regenerate if slots might be affected
  if (
    criticalFieldsChanged &&
    (appointmentType.isPublished || appointmentType.isShareEnabled)
  ) {
    // Regenerate slots in background (don't block response)
    // In production, this would be a queue job
    setImmediate(async () => {
      try {
        await regenerateSlotsForAppointmentType(appointmentType);
      } catch (error) {
        console.error("Slot regeneration failed:", error);
      }
    });
  }

  return appointmentType;
};

/**
 * Publish appointment type (makes it publicly bookable)
 * WHY triggers slot generation: Published appointments need availability
 */
export const publishAppointmentType = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  if (appointmentType.isPublished) {
    throw new ApiError(400, "Appointment type is already published");
  }

  appointmentType.isPublished = true;
  appointmentType.publishedAt = new Date();
  await appointmentType.save();

  // WHY generate slots on publish: Publish means "ready for bookings"
  // Generate next 90 days (or maxAdvanceBooking days)
  const daysToGenerate = appointmentType.maxAdvanceBooking || 90;
  await generateSlotsForAppointmentType(appointmentType, daysToGenerate);

  return appointmentType;
};

/**
 * Unpublish appointment type (removes from public listing)
 * WHY keep slots: Existing bookings must be honored
 */
export const unpublishAppointmentType = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  appointmentType.isPublished = false;
  await appointmentType.save();

  // WHY not delete slots: Existing bookings are still valid
  // Slots just become unbookable for new users
  return appointmentType;
};

/**
 * Enable sharing (generates secure token)
 * WHY separate from publish: Unlisted but bookable via direct link
 */
export const enableSharing = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  if (appointmentType.isShareEnabled) {
    // Already enabled, return existing token
    return appointmentType;
  }

  // Generate cryptographically secure token
  // WHY crypto.randomBytes: Unpredictable, prevents enumeration attacks
  const shareToken = crypto.randomBytes(32).toString("base64url");

  appointmentType.isShareEnabled = true;
  appointmentType.shareToken = shareToken;
  await appointmentType.save();

  // WHY generate slots if not already published: Share requires availability
  if (!appointmentType.isPublished && !appointmentType.lastSlotGeneration) {
    const daysToGenerate = appointmentType.maxAdvanceBooking || 90;
    await generateSlotsForAppointmentType(appointmentType, daysToGenerate);
  }

  return appointmentType;
};

/**
 * Disable sharing (revokes token)
 * WHY revocation: User may want to stop accepting bookings via link
 */
export const disableSharing = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  appointmentType.isShareEnabled = false;
  appointmentType.shareToken = null; // Revoke token
  await appointmentType.save();

  return appointmentType;
};

/**
 * Get appointment type by share token
 * WHY public method: Used by public booking flow
 */
export const getAppointmentTypeByShareToken = async (shareToken) => {
  const appointmentType = await AppointmentType.findByShareToken(shareToken);

  if (!appointmentType) {
    throw new ApiError(404, "Invalid or expired share link");
  }

  return appointmentType;
};

/**
 * Soft delete appointment type
 * WHY soft delete: Preserve referential integrity with slots/bookings
 */
export const deleteAppointmentType = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  // WHY check bookings: Prevent deletion if active bookings exist
  const activeBookingsCount = await Slot.countDocuments({
    appointmentTypeId: appointmentType._id,
    bookedCount: { $gt: 0 },
  });

  if (activeBookingsCount > 0) {
    throw new ApiError(
      400,
      "Cannot delete appointment type with active bookings. Unpublish instead."
    );
  }

  appointmentType.isDeleted = true;
  appointmentType.isPublished = false;
  appointmentType.isShareEnabled = false;
  await appointmentType.save();

  return appointmentType;
};

/**
 * Get all appointment types for a user
 */
export const getAppointmentTypes = async (userId, filters = {}) => {
  const query = { userId, isDeleted: false };

  if (filters.isPublished !== undefined) {
    query.isPublished = filters.isPublished;
  }

  if (filters.isShareEnabled !== undefined) {
    query.isShareEnabled = filters.isShareEnabled;
  }

  const appointmentTypes = await AppointmentType.find(query).sort({
    createdAt: -1,
  });

  return appointmentTypes;
};

/**
 * Get single appointment type
 */
export const getAppointmentTypeById = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

  return appointmentType;
};

/**
 * Get public appointment types (for directory/listing)
 */
export const getPublicAppointmentTypes = async (filters = {}) => {
  const query = {
    isPublished: true,
    isDeleted: false,
  };

  if (filters.providerId) {
    query.providerId = filters.providerId;
  }

  const appointmentTypes = await AppointmentType.find(query)
    .populate("providerId", "fullname avatar")
    .sort({ createdAt: -1 });

  return appointmentTypes;
};

// ============ SLOT GENERATION HELPERS ============

/**
 * Generate slots for appointment type
 * WHY async: Slot generation is expensive, don't block main thread
 */
const generateSlotsForAppointmentType = async (
  appointmentType,
  daysInAdvance
) => {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysInAdvance);

  const workingHours = appointmentType.getWorkingHours();

  await slotService.generateAndSaveSlots(
    appointmentType,
    startDate,
    endDate,
    workingHours
  );

  appointmentType.lastSlotGeneration = new Date();
  appointmentType.slotGenerationEndDate = endDate;
  await appointmentType.save();
};

/**
 * Regenerate slots (delete old, create new)
 * WHY regenerate: Configuration changes must reflect in availability
 */
const regenerateSlotsForAppointmentType = async (appointmentType) => {
  // Delete future unbooked slots
  await Slot.deleteMany({
    appointmentTypeId: appointmentType._id,
    startTime: { $gte: new Date() },
    bookedCount: 0,
  });

  // Generate new slots
  const daysToGenerate = appointmentType.maxAdvanceBooking || 90;
  await generateSlotsForAppointmentType(appointmentType, daysToGenerate);
};

/**
 * Get all bookings for a specific appointment (organiser view)
 * @param {String} appointmentTypeId - Appointment type ID
 * @param {String} userId - Organiser's user ID
 * @param {Object} filters - status, startDate, endDate, page, limit
 * @returns {Promise<Object>} Paginated bookings
 */
export const getAppointmentBookings = async (
  appointmentTypeId,
  userId,
  filters = {}
) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  // Verify appointment belongs to organiser
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
  });

  if (!appointmentType) {
    throw new ApiError(
      404,
      "Appointment not found or you don't have permission"
    );
  }

  // Build match stage
  const matchStage = {};

  if (filters.status) {
    matchStage.status = filters.status;
  }

  // Build aggregation pipeline
  const pipeline = [
    // Match slots for this appointment
    {
      $match: {
        appointmentTypeId: mongoose.Types.ObjectId(appointmentTypeId),
      },
    },

    // Lookup bookings
    {
      $lookup: {
        from: "bookings",
        localField: "_id",
        foreignField: "slotId",
        as: "bookings",
      },
    },

    // Unwind bookings
    { $unwind: "$bookings" },

    // Match booking filters
    { $match: { "bookings.status": matchStage.status || { $exists: true } } },

    // Filter by date range
    ...(filters.startDate || filters.endDate
      ? [
          {
            $match: {
              startTime: {
                ...(filters.startDate && {
                  $gte: new Date(filters.startDate),
                }),
                ...(filters.endDate && { $lte: new Date(filters.endDate) }),
              },
            },
          },
        ]
      : []),

    // Lookup user (customer)
    {
      $lookup: {
        from: "users",
        localField: "bookings.userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    // Sort by slot time
    { $sort: { startTime: -1 } },

    // Facet for pagination
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              bookingId: "$bookings._id",
              status: "$bookings.status",
              answers: "$bookings.answers",
              notes: "$bookings.notes",
              createdAt: "$bookings.createdAt",
              slot: {
                _id: "$_id",
                startTime: "$startTime",
                endTime: "$endTime",
                duration: "$duration",
                capacity: "$capacity",
                bookedCount: "$bookedCount",
              },
              user: {
                _id: "$user._id",
                fullname: "$user.fullname",
                email: "$user.email",
                username: "$user.username",
                avatar: "$user.avatar",
              },
            },
          },
        ],
      },
    },
  ];

  const [result] = await Slot.aggregate(pipeline);

  const total = result.metadata[0]?.total || 0;
  const bookings = result.data;

  return {
    appointmentType: {
      _id: appointmentType._id,
      name: appointmentType.name,
      description: appointmentType.description,
    },
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
 * Get appointment preview (read-only view without editing capabilities)
 * @param {String} appointmentTypeId - Appointment type ID
 * @returns {Promise<Object>} Appointment details for preview
 */
export const getAppointmentPreview = async (appointmentTypeId) => {
  const appointmentType = await AppointmentType.findById(appointmentTypeId)
    .select("-shareToken")
    .lean();

  if (!appointmentType) {
    throw new ApiError(404, "Appointment not found");
  }

  // Get basic stats
  const stats = await Slot.aggregate([
    {
      $match: { appointmentTypeId: mongoose.Types.ObjectId(appointmentTypeId) },
    },
    {
      $group: {
        _id: null,
        totalSlots: { $sum: 1 },
        totalCapacity: { $sum: "$capacity" },
        totalBooked: { $sum: "$bookedCount" },
        availableSlots: {
          $sum: {
            $cond: [{ $lt: ["$bookedCount", "$capacity"] }, 1, 0],
          },
        },
      },
    },
  ]);

  const previewStats = stats[0] || {
    totalSlots: 0,
    totalCapacity: 0,
    totalBooked: 0,
    availableSlots: 0,
  };

  return {
    ...appointmentType,
    stats: previewStats,
  };
};
