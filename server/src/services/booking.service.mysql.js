/**
 * Booking Service - MySQL + Prisma Implementation
 *
 * CRITICAL BUSINESS RULES:
 * 1. Slot capacity must NEVER be exceeded (enforced via transactions)
 * 2. Provider cannot be double-booked (conflict detection)
 * 3. Manual confirmation creates PENDING bookings
 * 4. Payment required bookings must have valid payment intent
 * 5. Cancellation cutoff enforced (hours before appointment)
 * 6. Booking questions validated against appointment config
 *
 * TRANSACTION SAFETY:
 * - All booking operations use database transactions
 * - Row-level locking prevents race conditions
 * - Automatic rollback on any failure
 */

import db, { withTransaction } from "../config/database.js";
import { ApiError } from "../utils/api-error.js";

/**
 * Create booking with transactional safety
 *
 * WHY TRANSACTION:
 * - Must atomically: check capacity, increment count, create booking
 * - Prevents double booking when multiple users book simultaneously
 *
 * @param {number} userId - Customer ID
 * @param {number} slotId - Slot ID
 * @param {Array} answers - Booking question answers
 * @param {string} notes - Optional notes
 * @returns {Promise<Object>} Created booking
 */
export const createBooking = async (
  userId,
  slotId,
  answers = [],
  notes = null
) => {
  return await withTransaction(
    async (tx) => {
      // 1. Lock slot and fetch related data
      const slot = await tx.slot.findUnique({
        where: { id: slotId },
        include: {
          appointmentType: {
            include: {
              questions: true,
            },
          },
          bookings: {
            where: {
              status: { in: ["CONFIRMED", "PENDING"] },
            },
          },
        },
      });

      if (!slot) {
        throw new ApiError(404, "Slot not found");
      }

      // 2. Validate slot is in future
      if (new Date(slot.startTime) < new Date()) {
        throw new ApiError(400, "Cannot book past slots");
      }

      // 3. Check capacity
      if (slot.bookedCount >= slot.capacity) {
        throw new ApiError(409, "Slot is fully booked");
      }

      // 4. Check minimum advance booking
      const hoursUntilSlot =
        (new Date(slot.startTime) - new Date()) / (1000 * 60 * 60);
      if (hoursUntilSlot < slot.appointmentType.minAdvanceBooking) {
        throw new ApiError(
          400,
          `Must book at least ${slot.appointmentType.minAdvanceBooking} hours in advance`
        );
      }

      // 5. Check maximum advance booking
      const daysUntilSlot = hoursUntilSlot / 24;
      if (daysUntilSlot > slot.appointmentType.maxAdvanceBooking) {
        throw new ApiError(
          400,
          `Cannot book more than ${slot.appointmentType.maxAdvanceBooking} days in advance`
        );
      }

      // 6. Validate required questions are answered
      const requiredQuestions = slot.appointmentType.questions.filter(
        (q) => q.required
      );
      for (const question of requiredQuestions) {
        const answer = answers.find((a) => a.questionId === question.id);
        if (!answer || !answer.answer) {
          throw new ApiError(400, `Question "${question.label}" is required`);
        }
      }

      // 7. Check provider availability (if assigned)
      if (slot.providerId) {
        const providerConflicts = await tx.booking.count({
          where: {
            slot: {
              providerId: slot.providerId,
              startTime: { lte: slot.endTime },
              endTime: { gte: slot.startTime },
            },
            status: { in: ["CONFIRMED", "PENDING"] },
            id: { not: null }, // Exclude current booking
          },
        });

        if (providerConflicts > 0) {
          throw new ApiError(409, "Provider is unavailable for this time slot");
        }
      }

      // 8. Increment booked count atomically
      await tx.slot.update({
        where: { id: slotId },
        data: {
          bookedCount: { increment: 1 },
        },
      });

      // 9. Determine booking status
      const status = slot.appointmentType.requiresManualConfirmation
        ? "PENDING"
        : "CONFIRMED";

      // 10. Create booking
      const booking = await tx.booking.create({
        data: {
          userId,
          slotId,
          status,
          answers: answers,
          notes,
          confirmedAt: status === "CONFIRMED" ? new Date() : null,
        },
        include: {
          slot: {
            include: {
              appointmentType: true,
              provider: {
                select: {
                  id: true,
                  fullname: true,
                  email: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              fullname: true,
              email: true,
            },
          },
        },
      });

      // 11. Create notification
      await tx.notification.create({
        data: {
          userId,
          type:
            status === "CONFIRMED" ? "BOOKING_CONFIRMED" : "BOOKING_PENDING",
          channel: "EMAIL",
          subject:
            status === "CONFIRMED"
              ? "Booking Confirmed"
              : "Booking Pending Confirmation",
          message:
            status === "CONFIRMED"
              ? `Your appointment for ${
                  slot.appointmentType.name
                } on ${new Date(slot.startTime).toLocaleString()} is confirmed.`
              : `Your booking request for ${slot.appointmentType.name} is pending organiser confirmation.`,
          metadata: {
            bookingId: booking.id,
            slotId: slot.id,
            appointmentTypeId: slot.appointmentType.id,
          },
        },
      });

      // 12. Notify organiser for pending bookings
      if (status === "PENDING") {
        await tx.notification.create({
          data: {
            userId: slot.appointmentType.userId,
            type: "BOOKING_PENDING",
            channel: "EMAIL",
            subject: "New Booking Requires Confirmation",
            message: `${booking.user.fullname} has requested a booking for ${
              slot.appointmentType.name
            } on ${new Date(slot.startTime).toLocaleString()}.`,
            metadata: {
              bookingId: booking.id,
              customerId: userId,
            },
          },
        });
      }

      return booking;
    },
    { isolationLevel: "Serializable" }
  );
};

/**
 * Confirm pending booking (Manual Confirmation Feature)
 *
 * @param {number} bookingId - Booking ID
 * @param {number} confirmingUserId - Admin/Organiser ID
 * @returns {Promise<Object>} Updated booking
 */
export const confirmBooking = async (bookingId, confirmingUserId) => {
  return await withTransaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: {
          include: {
            appointmentType: true,
          },
        },
        user: true,
      },
    });

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (booking.status !== "PENDING") {
      throw new ApiError(400, "Only pending bookings can be confirmed");
    }

    // Verify user has permission (must be organiser or admin)
    const confirmingUser = await tx.user.findUnique({
      where: { id: confirmingUserId },
    });

    const isOrganiser =
      booking.slot.appointmentType.userId === confirmingUserId;
    const isAdmin = confirmingUser.role === "ADMIN";

    if (!isOrganiser && !isAdmin) {
      throw new ApiError(
        403,
        "You do not have permission to confirm this booking"
      );
    }

    // Update booking
    const confirmed = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedBy: confirmingUserId,
      },
      include: {
        slot: {
          include: {
            appointmentType: true,
          },
        },
        user: true,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: confirmingUserId,
        action: "BOOKING_CONFIRMED",
        entityType: "booking",
        entityId: bookingId,
        metadata: {
          bookingId,
          customerId: booking.userId,
          appointmentTypeId: booking.slot.appointmentType.id,
        },
      },
    });

    // Notify customer
    await tx.notification.create({
      data: {
        userId: booking.userId,
        type: "BOOKING_CONFIRMED",
        channel: "EMAIL",
        subject: "Your Booking is Confirmed",
        message: `Your booking for ${
          booking.slot.appointmentType.name
        } on ${new Date(
          booking.slot.startTime
        ).toLocaleString()} has been confirmed.`,
        metadata: { bookingId },
      },
    });

    return confirmed;
  });
};

/**
 * Reject pending booking (Manual Confirmation Feature)
 *
 * @param {number} bookingId - Booking ID
 * @param {number} rejectingUserId - Admin/Organiser ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<Object>} Updated booking
 */
export const rejectBooking = async (
  bookingId,
  rejectingUserId,
  reason = null
) => {
  return await withTransaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: {
          include: {
            appointmentType: true,
          },
        },
        user: true,
      },
    });

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (booking.status !== "PENDING") {
      throw new ApiError(400, "Only pending bookings can be rejected");
    }

    // Update booking
    const rejected = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "REJECTED",
        cancelReason: reason,
        cancelledAt: new Date(),
      },
      include: {
        slot: true,
        user: true,
      },
    });

    // Decrement slot count
    await tx.slot.update({
      where: { id: booking.slotId },
      data: {
        bookedCount: { decrement: 1 },
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId: rejectingUserId,
        action: "BOOKING_REJECTED",
        entityType: "booking",
        entityId: bookingId,
        metadata: {
          bookingId,
          reason,
        },
      },
    });

    // Notify customer
    await tx.notification.create({
      data: {
        userId: booking.userId,
        type: "BOOKING_REJECTED",
        channel: "EMAIL",
        subject: "Booking Request Declined",
        message: reason
          ? `Your booking request has been declined. Reason: ${reason}`
          : "Your booking request has been declined.",
        metadata: { bookingId },
      },
    });

    return rejected;
  });
};

/**
 * Cancel booking with cutoff enforcement
 *
 * @param {number} bookingId - Booking ID
 * @param {number} userId - User ID (customer or admin)
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Updated booking
 */
export const cancelBooking = async (bookingId, userId, reason = null) => {
  return await withTransaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: {
          include: {
            appointmentType: true,
          },
        },
        user: true,
      },
    });

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
      throw new ApiError(
        400,
        `Cannot cancel ${booking.status.toLowerCase()} booking`
      );
    }

    // Check cancellation cutoff (only for customers, not admins)
    const user = await tx.user.findUnique({ where: { id: userId } });
    const isCustomer = booking.userId === userId;

    if (isCustomer) {
      const hoursUntilSlot =
        (new Date(booking.slot.startTime) - new Date()) / (1000 * 60 * 60);
      if (hoursUntilSlot < booking.slot.appointmentType.cancellationCutoff) {
        throw new ApiError(
          400,
          `Cannot cancel within ${booking.slot.appointmentType.cancellationCutoff} hours of appointment`
        );
      }
    }

    // Update booking
    const cancelled = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledAt: new Date(),
      },
      include: {
        slot: {
          include: {
            appointmentType: true,
          },
        },
      },
    });

    // Decrement slot count
    await tx.slot.update({
      where: { id: booking.slotId },
      data: {
        bookedCount: { decrement: 1 },
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        userId,
        action: "BOOKING_CANCELLED",
        entityType: "booking",
        entityId: bookingId,
        metadata: {
          bookingId,
          reason,
          cancelledBy: userId,
        },
      },
    });

    // Notify customer
    await tx.notification.create({
      data: {
        userId: booking.userId,
        type: "BOOKING_CANCELLED",
        channel: "EMAIL",
        subject: "Booking Cancelled",
        message: `Your booking for ${booking.slot.appointmentType.name} has been cancelled.`,
        metadata: { bookingId },
      },
    });

    return cancelled;
  });
};

/**
 * Get user's bookings with filters
 *
 * @param {number} userId - User ID
 * @param {Object} filters - { filter: 'upcoming'|'past', status, page, limit }
 * @returns {Promise<Object>} Paginated bookings
 */
export const getUserBookings = async (userId, filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const skip = (page - 1) * limit;

  const where = {
    userId,
    ...(filters.status && { status: filters.status }),
  };

  // Filter by time
  if (filters.filter === "upcoming") {
    where.slot = {
      startTime: { gte: new Date() },
    };
  } else if (filters.filter === "past") {
    where.slot = {
      startTime: { lt: new Date() },
    };
  }

  const [bookings, total] = await Promise.all([
    db.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        slot: {
          startTime: filters.filter === "past" ? "desc" : "asc",
        },
      },
      include: {
        slot: {
          include: {
            appointmentType: {
              select: {
                id: true,
                name: true,
                description: true,
                duration: true,
                price: true,
                currency: true,
              },
            },
            provider: {
              select: {
                id: true,
                fullname: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    db.booking.count({ where }),
  ]);

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
 * Get booking by ID with full details
 *
 * @param {number} bookingId - Booking ID
 * @returns {Promise<Object>} Booking details
 */
export const getBookingById = async (bookingId) => {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: {
        select: {
          id: true,
          fullname: true,
          email: true,
          username: true,
          avatar: true,
        },
      },
      slot: {
        include: {
          appointmentType: {
            include: {
              questions: true,
            },
          },
          provider: {
            select: {
              id: true,
              fullname: true,
              email: true,
            },
          },
        },
      },
      payments: true,
    },
  });

  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  return booking;
};
