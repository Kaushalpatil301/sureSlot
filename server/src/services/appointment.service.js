import { AppointmentType } from "../models/appointmentType.model.js";
import { Slot } from "../models/slot.model.js";
import { Booking } from "../models/booking.model.js";
import { ApiError } from "../utils/api-error.js";
import { validateWorkingHours } from "../utils/time.js";
import * as slotService from "./slot.service.js";
import crypto from "crypto";
import mongoose from "mongoose";

export const createAppointmentType = async (userId, data) => {
  
  const validation = validateWorkingHours(data.workingHours || {});
  if (!validation.valid) {
    throw new ApiError(400, `Invalid working hours: ${validation.error}`);
  }

  const appointmentType = new AppointmentType({
    ...data,
    userId,
    isPublished: false,
    isShareEnabled: false,
  });

  await appointmentType.save();
  return appointmentType;
};

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

  if (data.workingHours) {
    const validation = validateWorkingHours(data.workingHours);
    if (!validation.valid) {
      throw new ApiError(400, `Invalid working hours: ${validation.error}`);
    }
  }

  const criticalFieldsChanged =
    (data.duration && data.duration !== appointmentType.duration) ||
    (data.capacity && data.capacity !== appointmentType.capacity) ||
    (data.workingHours &&
      JSON.stringify(data.workingHours) !==
        JSON.stringify(appointmentType.getWorkingHours()));

  Object.assign(appointmentType, data);
  await appointmentType.save();

  if (
    criticalFieldsChanged &&
    (appointmentType.isPublished || appointmentType.isShareEnabled)
  ) {

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

  const daysToGenerate = appointmentType.maxAdvanceBooking || 90;
  await generateSlotsForAppointmentType(appointmentType, daysToGenerate);

  return appointmentType;
};

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

  return appointmentType;
};

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
    
    return appointmentType;
  }

  const shareToken = crypto.randomBytes(32).toString("base64url");

  appointmentType.isShareEnabled = true;
  appointmentType.shareToken = shareToken;
  await appointmentType.save();

  if (!appointmentType.isPublished && !appointmentType.lastSlotGeneration) {
    const daysToGenerate = appointmentType.maxAdvanceBooking || 90;
    await generateSlotsForAppointmentType(appointmentType, daysToGenerate);
  }

  return appointmentType;
};

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
  appointmentType.shareToken = null; 
  await appointmentType.save();

  return appointmentType;
};

export const getAppointmentTypeByShareToken = async (shareToken) => {
  const appointmentType = await AppointmentType.findByShareToken(shareToken);

  if (!appointmentType) {
    throw new ApiError(404, "Invalid or expired share link");
  }

  return appointmentType;
};

export const deleteAppointmentType = async (appointmentTypeId, userId) => {
  const appointmentType = await AppointmentType.findOne({
    _id: appointmentTypeId,
    userId,
    isDeleted: false,
  });

  if (!appointmentType) {
    throw new ApiError(404, "Appointment type not found");
  }

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

const regenerateSlotsForAppointmentType = async (appointmentType) => {
  
  await Slot.deleteMany({
    appointmentTypeId: appointmentType._id,
    startTime: { $gte: new Date() },
    bookedCount: 0,
  });

  const daysToGenerate = appointmentType.maxAdvanceBooking || 90;
  await generateSlotsForAppointmentType(appointmentType, daysToGenerate);
};

export const getAppointmentBookings = async (
  appointmentTypeId,
  userId,
  filters = {}
) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

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

  const matchStage = {};

  if (filters.status) {
    matchStage.status = filters.status;
  }

  const pipeline = [
    
    {
      $match: {
        appointmentTypeId: mongoose.Types.ObjectId(appointmentTypeId),
      },
    },

    {
      $lookup: {
        from: "bookings",
        localField: "_id",
        foreignField: "slotId",
        as: "bookings",
      },
    },

    { $unwind: "$bookings" },

    { $match: { "bookings.status": matchStage.status || { $exists: true } } },

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

    {
      $lookup: {
        from: "users",
        localField: "bookings.userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },

    { $sort: { startTime: -1 } },

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

export const getAppointmentPreview = async (appointmentTypeId) => {
  const appointmentType = await AppointmentType.findById(appointmentTypeId)
    .select("-shareToken")
    .lean();

  if (!appointmentType) {
    throw new ApiError(404, "Appointment not found");
  }

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
