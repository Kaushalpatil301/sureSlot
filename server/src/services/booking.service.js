import { Booking } from "../models/booking.model.js";
import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

export const createBooking = async (userId, slotId, bookingData = {}) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const slot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        status: "AVAILABLE",
        $expr: { $lt: ["$bookedCount", "$capacity"] },
      },
      {
        $inc: { bookedCount: 1 },
      },
      {
        new: true,
        session,
      }
    );

    if (!slot) {
      throw new ApiError(
        409,
        "Slot is not available (fully booked, blocked, or does not exist)"
      );
    }

    if (slot.startTime <= new Date()) {
      throw new ApiError(400, "Cannot book a slot in the past");
    }

    const booking = await Booking.create(
      [
        {
          userId,
          slotId,
          status: "CONFIRMED",
          answers: bookingData.answers || {},
          notes: bookingData.notes || "",
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const createdBooking = await Booking.findById(booking[0]._id)
      .populate("slotId")
      .populate("userId", "username email fullname");

    return createdBooking;
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;

    if (error.code === 11000) {
      throw new ApiError(409, "You have already booked this slot");
    }

    throw new ApiError(500, `Booking creation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

export const cancelBooking = async (bookingId, userId) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (booking.userId.toString() !== userId.toString()) {
      throw new ApiError(403, "You are not authorized to cancel this booking");
    }

    if (!booking.canBeCancelled) {
      throw new ApiError(
        400,
        "Booking cannot be cancelled (already cancelled)"
      );
    }

    booking.status = "CANCELLED";
    await booking.save({ session });

    const slot = await Slot.findOneAndUpdate(
      {
        _id: booking.slotId,
        bookedCount: { $gt: 0 },
      },
      {
        $inc: { bookedCount: -1 },
      },
      {
        new: true,
        session,
      }
    );

    if (!slot) {
      throw new ApiError(
        500,
        "Failed to release slot (data inconsistency detected)"
      );
    }

    await session.commitTransaction();

    const cancelledBooking = await Booking.findById(bookingId)
      .populate("slotId")
      .populate("userId", "username email fullname");

    return cancelledBooking;
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Booking cancellation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

export const getUserBookings = async (userId, status = null) => {
  try {
    const filter = { userId };

    if (status) {
      if (!["PENDING", "CONFIRMED", "CANCELLED"].includes(status)) {
        throw new ApiError(
          400,
          "Invalid status. Use PENDING, CONFIRMED, or CANCELLED"
        );
      }
      filter.status = status;
    }

    const bookings = await Booking.find(filter)
      .populate("slotId")
      .sort({ createdAt: -1 });

    return bookings;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch bookings: ${error.message}`);
  }
};

export const getBookingById = async (bookingId, userId) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate("slotId")
      .populate("userId", "username email fullname");

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (booking.userId._id.toString() !== userId.toString()) {
      throw new ApiError(403, "You are not authorized to view this booking");
    }

    return booking;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch booking: ${error.message}`);
  }
};

export const verifySlotBookingIntegrity = async (slotId) => {
  try {
    const slot = await Slot.findById(slotId);
    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    const confirmedCount = await Booking.countConfirmedBookingsForSlot(slotId);

    const isValid = slot.bookedCount === confirmedCount;

    return {
      slotId,
      slotBookedCount: slot.bookedCount,
      actualConfirmedBookings: confirmedCount,
      isValid,
      discrepancy: isValid ? 0 : Math.abs(slot.bookedCount - confirmedCount),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Integrity check failed: ${error.message}`);
  }
};

export default {
  createBooking,
  cancelBooking,
  getUserBookings,
  getBookingById,
  verifySlotBookingIntegrity,
};
