import mongoose, { Schema } from "mongoose";

const appointmentTypeSchema = new Schema(
  {
    
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,

    },

    name: {
      type: String,
      required: true,
      trim: true,
      
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      default: "#3B82F6",
      
    },

    duration: {
      type: Number,
      required: true,
      min: 5,

    },
    workingHours: {
      type: Map,
      of: {
        enabled: { type: Boolean, default: false },
        start: { type: String }, 
        end: { type: String }, 
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

    },

    capacity: {
      type: Number,
      required: true,
      default: 1,
      min: 1,

    },

    minAdvanceBooking: {
      type: Number,
      default: 0,
      min: 0,

    },
    maxAdvanceBooking: {
      type: Number,
      default: 90,
      min: 1,

    },

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

    },

    requiresManualConfirmation: {
      type: Boolean,
      default: false,

    },

    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",

    },

    isPublished: {
      type: Boolean,
      default: false,

    },
    publishedAt: {
      type: Date,
      
    },

    isShareEnabled: {
      type: Boolean,
      default: false,

    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true, 

    },

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

      },
    ],

    lastSlotGeneration: {
      type: Date,

    },
    slotGenerationEndDate: {
      type: Date,

    },

    isDeleted: {
      type: Boolean,
      default: false,

    },
  },
  {
    timestamps: true,
  }
);

appointmentTypeSchema.index({ userId: 1, isDeleted: 1 });

appointmentTypeSchema.index({ isPublished: 1, isDeleted: 1 });

appointmentTypeSchema.index({ shareToken: 1 }, { sparse: true });

appointmentTypeSchema.index({ providerId: 1 }, { sparse: true });

appointmentTypeSchema.virtual("isActive").get(function () {
  
  return !this.isDeleted && (this.isPublished || this.isShareEnabled);
});

appointmentTypeSchema.methods.needsSlotGeneration = function () {
  if (!this.isPublished && !this.isShareEnabled) {
    return false; 
  }

  if (!this.lastSlotGeneration) {
    return true; 
  }

  if (this.updatedAt > this.lastSlotGeneration) {
    return true; 
  }

  return false;
};

appointmentTypeSchema.methods.getWorkingHours = function () {
  
  const hours = {};
  if (this.workingHours) {
    this.workingHours.forEach((value, key) => {
      hours[key] = value;
    });
  }
  return hours;
};

appointmentTypeSchema.statics.findActiveByUser = function (userId) {
  return this.find({
    userId,
    isDeleted: false,
    $or: [{ isPublished: true }, { isShareEnabled: true }],
  });
};

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
