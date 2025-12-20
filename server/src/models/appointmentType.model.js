import mongoose, { Schema } from "mongoose";

/**
 * AppointmentType Model - The RULE ENGINE for appointment scheduling
 *
 * WHY this is the core of the system:
 * - Defines WHAT appointments can be booked (not WHEN - that's slots)
 * - Centralized configuration prevents inconsistent rules
 * - Slots are generated FROM appointment types
 * - Changes to appointment type can trigger slot regeneration
 *
 * RELATIONSHIP:
 * AppointmentType (1) → (many) Slots → (many) Bookings
 * AppointmentType defines rules → Slots are inventory → Bookings are transactions
 */
const appointmentTypeSchema = new Schema(
  {
    // ============ OWNERSHIP ============
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      // WHY: Each appointment type belongs to a user (provider/organizer)
      // Enables multi-tenant system where each user manages their own appointment types
    },

    // ============ BASIC INFO ============
    name: {
      type: String,
      required: true,
      trim: true,
      // e.g., "30-min Consultation", "Vaccine Appointment", "Haircut"
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      default: "#3B82F6",
      // WHY: Visual differentiation in calendars/dashboards
    },

    // ============ TIMING RULES ============
    duration: {
      type: Number,
      required: true,
      min: 5,
      // Duration in minutes
      // WHY required: Slots cannot be generated without knowing duration
    },
    workingHours: {
      type: Map,
      of: {
        enabled: { type: Boolean, default: false },
        start: { type: String }, // "09:00"
        end: { type: String }, // "17:00"
      },
      default: {
        monday: { enabled: true, start: "09:00", end: "17:00" },
        tuesday: { enabled: true, start: "09:00", end: "17:00" },
        wednesday: { enabled: true, start: "09:00", end: "17:00" },
        thursday: { enabled: true, start: "09:00", end: "17:00" },
        friday: { enabled: true, start: "09:00", end: "17:00" },
        saturday: { enabled: false, start: "09:00", end: "17:00" },
        sunday: { enabled: false, start: "09:00", end: "17:00" },
      },
      // WHY Map: Flexible key-value storage for day-specific configs
      // Mongoose will serialize this as object in MongoDB
    },

    // ============ CAPACITY ============
    capacity: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      // WHY: Enables group appointments (webinars, group therapy, etc.)
      // Single capacity = 1-on-1 appointment
    },

    // ============ ADVANCE BOOKING RULES ============
    minAdvanceBooking: {
      type: Number,
      default: 0,
      min: 0,
      // Minimum hours in advance that bookings can be made
      // WHY: Prevents last-minute bookings if preparation time needed
    },
    maxAdvanceBooking: {
      type: Number,
      default: 90,
      min: 1,
      // Maximum days in advance that bookings can be made
      // WHY: Prevents booking too far into uncertain future
    },

    // ============ PAYMENT ============
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    requiresAdvancePayment: {
      type: Boolean,
      default: false,
      // WHY: If true, booking creates BookingIntent first (payment flow)
      // If false, booking is immediate
    },

    // ============ CONFIRMATION FLOW ============
    requiresManualConfirmation: {
      type: Boolean,
      default: false,
      // WHY: Some appointments need provider approval (interviews, consultations)
      // If true, bookings start as PENDING
      // If false, bookings are immediately CONFIRMED
    },

    // ============ PROVIDER/RESOURCE ============
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      // WHY optional: Not all appointment types are tied to specific providers
      // Example: "Conference Room Booking" has no provider
      // Example: "Dr. Smith Consultation" has providerId = Dr. Smith's userId
    },

    // ============ PUBLISHING ============
    isPublished: {
      type: Boolean,
      default: false,
      // WHY two-phase approach:
      // 1. Create appointment type (isPublished = false) - no slots generated
      // 2. Publish (isPublished = true) - triggers slot generation
      // Unpublishing hides from public but keeps existing bookings
    },
    publishedAt: {
      type: Date,
      // WHY: Track when appointment type went live
    },

    // ============ SHARING (PUBLIC LINK) ============
    isShareEnabled: {
      type: Boolean,
      default: false,
      // WHY separate from isPublished:
      // - isPublished = listed in public directory
      // - isShareEnabled = accessible via direct link only
      // Enables "unlisted but bookable" appointments
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true, // WHY sparse: Only documents with shareToken have unique constraint
      // WHY: Cryptographically secure random token for public access
      // Generated when isShareEnabled = true
    },

    // ============ BOOKING QUESTIONS ============
    questions: [
      {
        question: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ["TEXT", "EMAIL", "PHONE", "NUMBER", "TEXTAREA"],
          default: "TEXT",
        },
        required: {
          type: Boolean,
          default: false,
        },
        placeholder: String,
        // WHY: Collect custom info during booking (allergies, preferences, etc.)
        // Stored as JSON in booking.answers
      },
    ],

    // ============ SLOT GENERATION METADATA ============
    lastSlotGeneration: {
      type: Date,
      // WHY: Track when slots were last generated
      // Helps detect if configuration changed since generation
    },
    slotGenerationEndDate: {
      type: Date,
      // WHY: Track how far into the future slots exist
      // Enables incremental generation (generate next 30 days)
    },

    // ============ SOFT DELETE ============
    isDeleted: {
      type: Boolean,
      default: false,
      // WHY: Never hard-delete appointment types
      // - Preserves referential integrity with slots/bookings
      // - Enables restoration if deleted accidentally
      // - Required for audit trail
    },
  },
  {
    timestamps: true,
  }
);

// ============ INDEXES ============

// Query by owner
appointmentTypeSchema.index({ userId: 1, isDeleted: 1 });

// Public listing (published appointments)
appointmentTypeSchema.index({ isPublished: 1, isDeleted: 1 });

// Share token lookup
appointmentTypeSchema.index({ shareToken: 1 }, { sparse: true });

// Provider-specific queries
appointmentTypeSchema.index({ providerId: 1 }, { sparse: true });

// ============ VIRTUAL FIELDS ============

appointmentTypeSchema.virtual("isActive").get(function () {
  // WHY: Centralized logic for "can this be booked?"
  return !this.isDeleted && (this.isPublished || this.isShareEnabled);
});

// ============ METHODS ============

/**
 * Check if appointment type needs slot generation
 * WHY: Avoid unnecessary regeneration
 */
appointmentTypeSchema.methods.needsSlotGeneration = function () {
  if (!this.isPublished && !this.isShareEnabled) {
    return false; // Unpublished and not shared = no slots needed
  }

  if (!this.lastSlotGeneration) {
    return true; // Never generated
  }

  // Check if configuration changed since last generation
  if (this.updatedAt > this.lastSlotGeneration) {
    return true; // Configuration changed
  }

  return false;
};

/**
 * Get validated working hours as plain object
 */
appointmentTypeSchema.methods.getWorkingHours = function () {
  // WHY: Mongoose Map needs conversion to plain object
  const hours = {};
  if (this.workingHours) {
    this.workingHours.forEach((value, key) => {
      hours[key] = value;
    });
  }
  return hours;
};

// ============ STATIC METHODS ============

/**
 * Find active appointment types for a user
 */
appointmentTypeSchema.statics.findActiveByUser = function (userId) {
  return this.find({
    userId,
    isDeleted: false,
    $or: [{ isPublished: true }, { isShareEnabled: true }],
  });
};

/**
 * Find by share token
 */
appointmentTypeSchema.statics.findByShareToken = function (token) {
  return this.findOne({
    shareToken: token,
    isShareEnabled: true,
    isDeleted: false,
  });
};

export const AppointmentType = mongoose.model(
  "AppointmentType",
  appointmentTypeSchema
);
