import bcrypt from "bcrypt";
import { User } from "../models/user.model.js";
import { AppointmentType } from "../models/appointmentType.model.js";
import { Slot } from "../models/slot.model.js";
import { Booking } from "../models/booking.model.js";
import { BookingIntent } from "../models/bookingIntent.model.js";
import { Payment } from "../models/payment.model.js";

/**
 * Demo Bootstrap
 *
 * Creates minimal demo data for local development
 * - Only runs in development mode
 * - Idempotent: safe to restart server
 * - Uses existing services where possible
 * - Checks existence before creating
 *
 * DO NOT RUN IN PRODUCTION
 */

const DEMO_PASSWORD = "Demo@1234"; // Known password for testing

/**
 * Generate slots for demo (simplified version)
 */
const generateDemoSlots = (
  appointmentTypeId,
  startDate,
  endDate,
  duration,
  capacity,
  daysOfWeek,
  startTime,
  endTime
) => {
  const slots = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();

    // Check if this day should have slots
    if (daysOfWeek.includes(dayOfWeek)) {
      // Parse start and end times
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);

      // Generate slots for this day
      let currentSlotStart = new Date(currentDate);
      currentSlotStart.setHours(startHour, startMin, 0, 0);

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(endHour, endMin, 0, 0);

      while (currentSlotStart < dayEnd) {
        const slotEnd = new Date(currentSlotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);

        if (slotEnd <= dayEnd) {
          slots.push({
            appointmentTypeId,
            startTime: new Date(currentSlotStart),
            endTime: new Date(slotEnd),
            duration,
            capacity,
            bookedCount: 0,
            status: "AVAILABLE",
          });
        }

        currentSlotStart = slotEnd;
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return slots;
};

export const bootstrapDemoData = async () => {
  // Safety check: Only run in development
  if (process.env.NODE_ENV === "production") {
    console.log("⏭️  Skipping demo bootstrap (production mode)");
    return;
  }

  try {
    console.log("\n🎬 Starting demo bootstrap...");

    // ===========================
    // 1. CREATE DEMO USERS
    // ===========================

    const demoUsers = [
      {
        email: "admin@demo.com",
        username: "admin_demo",
        fullname: "Admin User",
        role: "ADMIN",
        password: DEMO_PASSWORD,
      },
      {
        email: "organiser@demo.com",
        username: "organiser_demo",
        fullname: "Demo Organiser",
        role: "ORGANISER",
        password: DEMO_PASSWORD,
      },
      {
        email: "user1@demo.com",
        username: "john_doe",
        fullname: "John Doe",
        role: "USER",
        password: DEMO_PASSWORD,
      },
      {
        email: "user2@demo.com",
        username: "jane_smith",
        fullname: "Jane Smith",
        role: "USER",
        password: DEMO_PASSWORD,
      },
    ];

    const createdUsers = {};

    for (const userData of demoUsers) {
      let user = await User.findOne({ email: userData.email });

      if (!user) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        user = await User.create({
          ...userData,
          password: hashedPassword,
          isEmailVerified: true, // All demo users verified
        });
        console.log(
          `✅ Created demo user: ${userData.email} (${userData.role})`
        );
      } else {
        console.log(`⏭️  User already exists: ${userData.email}`);
      }

      createdUsers[userData.role] = user;
    }

    // ===========================
    // 2. CREATE APPOINTMENT TYPES
    // ===========================

    const organiserId = createdUsers.ORGANISER._id;

    // Appointment Type 1: Free Consultation (No payment)
    let freeConsultation = await AppointmentType.findOne({
      name: "Free Consultation",
      userId: organiserId,
    });

    if (!freeConsultation) {
      freeConsultation = await AppointmentType.create({
        name: "Free Consultation",
        description: "30-minute free consultation call",
        duration: 30,
        capacity: 3,
        requiresPayment: false,
        price: 0,
        currency: "USD",
        status: "PUBLISHED",
        userId: organiserId,
        bookingQuestions: [
          {
            question: "What would you like to discuss?",
            required: true,
          },
        ],
      });
      console.log("✅ Created appointment type: Free Consultation");
    } else {
      console.log("⏭️  Appointment type already exists: Free Consultation");
    }

    // Appointment Type 2: Paid Workshop (Requires payment)
    let paidWorkshop = await AppointmentType.findOne({
      name: "Technical Workshop",
      userId: organiserId,
    });

    if (!paidWorkshop) {
      paidWorkshop = await AppointmentType.create({
        name: "Technical Workshop",
        description: "1-hour hands-on technical workshop",
        duration: 60,
        capacity: 10,
        requiresPayment: true,
        price: 4999, // $49.99
        currency: "USD",
        status: "PUBLISHED",
        userId: organiserId,
        isShareEnabled: true,
        shareToken: "demo-workshop-123",
        bookingQuestions: [
          {
            question: "What is your experience level?",
            required: true,
          },
          {
            question: "Any specific topics you want covered?",
            required: false,
          },
        ],
      });
      console.log("✅ Created appointment type: Technical Workshop");
    } else {
      console.log("⏭️  Appointment type already exists: Technical Workshop");
    }

    // ===========================
    // 3. GENERATE SLOTS
    // ===========================

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = today;
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 3); // Next 3 days

    // Generate slots for Free Consultation
    const existingFreeSlots = await Slot.countDocuments({
      appointmentTypeId: freeConsultation._id,
    });

    if (existingFreeSlots === 0) {
      const freeSlots = generateDemoSlots(
        freeConsultation._id,
        startDate,
        endDate,
        30, // duration
        3, // capacity
        [1, 2, 3, 4, 5], // Mon-Fri
        "09:00",
        "17:00"
      );

      await Slot.insertMany(freeSlots);
      console.log(
        `✅ Generated ${freeSlots.length} slots for Free Consultation`
      );
    } else {
      console.log(
        `⏭️  Slots already exist for Free Consultation (${existingFreeSlots} slots)`
      );
    }

    // Generate slots for Paid Workshop
    const existingPaidSlots = await Slot.countDocuments({
      appointmentTypeId: paidWorkshop._id,
    });

    if (existingPaidSlots === 0) {
      const paidSlots = generateDemoSlots(
        paidWorkshop._id,
        startDate,
        endDate,
        60, // duration
        10, // capacity
        [1, 3, 5], // Mon, Wed, Fri
        "10:00",
        "16:00"
      );

      await Slot.insertMany(paidSlots);
      console.log(
        `✅ Generated ${paidSlots.length} slots for Technical Workshop`
      );
    } else {
      console.log(
        `⏭️  Slots already exist for Technical Workshop (${existingPaidSlots} slots)`
      );
    }

    // ===========================
    // 4. CREATE DEMO BOOKINGS
    // ===========================

    // Get a slot for booking
    const availableSlot = await Slot.findOne({
      appointmentTypeId: freeConsultation._id,
      status: "AVAILABLE",
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    });

    if (availableSlot) {
      const existingBooking = await Booking.findOne({
        slotId: availableSlot._id,
        userId: createdUsers.USER._id,
      });

      if (!existingBooking) {
        // Create confirmed booking
        const booking = await Booking.create({
          userId: createdUsers.USER._id,
          slotId: availableSlot._id,
          appointmentTypeId: freeConsultation._id,
          status: "CONFIRMED",
          bookingAnswers: [
            {
              question: "What would you like to discuss?",
              answer: "I want to learn about the product features",
            },
          ],
        });

        // Increment slot's bookedCount
        await Slot.findByIdAndUpdate(availableSlot._id, {
          $inc: { bookedCount: 1 },
        });

        console.log("✅ Created demo booking (CONFIRMED)");
      } else {
        console.log("⏭️  Demo booking already exists");
      }
    }

    // Create a pending booking intent
    const pendingSlot = await Slot.findOne({
      appointmentTypeId: paidWorkshop._id,
      status: "AVAILABLE",
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    });

    if (pendingSlot) {
      const existingIntent = await BookingIntent.findOne({
        slotId: pendingSlot._id,
        userId: createdUsers.USER._id,
      });

      if (!existingIntent) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15);

        await BookingIntent.create({
          userId: createdUsers.USER._id,
          slotId: pendingSlot._id,
          appointmentTypeId: paidWorkshop._id,
          status: "PENDING",
          expiresAt,
          amount: 4999, // $49.99
          currency: "USD",
          bookingAnswers: [
            {
              question: "What is your experience level?",
              answer: "Intermediate",
            },
          ],
        });

        console.log("✅ Created demo booking intent (PENDING)");
      } else {
        console.log("⏭️  Demo booking intent already exists");
      }
    }

    // ===========================
    // 5. SKIP DEMO PAYMENTS (Created automatically by webhooks)
    // ===========================

    // Payments are created automatically by the Stripe webhook handler
    // Manual payment creation skipped to avoid enum validation issues

    console.log("\n🎉 Demo bootstrap complete!");
    console.log("\n📋 Demo Accounts:");
    console.log("   Admin:     admin@demo.com / Demo@1234");
    console.log("   Organiser: organiser@demo.com / Demo@1234");
    console.log("   User1:     user1@demo.com / Demo@1234");
    console.log("   User2:     user2@demo.com / Demo@1234\n");
  } catch (error) {
    console.error("❌ Demo bootstrap failed:", error.message);
    // Don't throw - let server continue even if demo fails
  }
};
