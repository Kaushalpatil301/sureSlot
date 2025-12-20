import Stripe from "stripe";
import { BookingIntent } from "../models/bookingIntent.model.js";
import { Payment } from "../models/payment.model.js";
import { Slot } from "../models/slot.model.js";
import { ApiError } from "../utils/api-error.js";
import { createBooking } from "./booking.service.js";
import mongoose from "mongoose";
import env from "../config/env.js";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    })
  : null;

export const createBookingIntent = async (
  userId,
  slotId,
  amount,
  options = {}
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const existingIntent = await BookingIntent.findActiveIntent(userId, slotId);

    if (existingIntent) {
      throw new ApiError(
        409,
        "You already have a pending booking intent for this slot"
      );
    }

    const slot = await Slot.findById(slotId).session(session);

    if (!slot) {
      throw new ApiError(404, "Slot not found");
    }

    if (slot.status !== "AVAILABLE") {
      throw new ApiError(400, "Slot is blocked or unavailable");
    }

    if (slot.bookedCount >= slot.capacity) {
      throw new ApiError(409, "Slot is fully booked");
    }

    if (slot.startTime <= new Date()) {
      throw new ApiError(400, "Cannot book a slot in the past");
    }

    const expiryMinutes = env.BOOKING_INTENT_EXPIRY_MINUTES || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const intent = await BookingIntent.create(
      [
        {
          userId,
          slotId,
          amount,
          currency: options.currency || "USD",
          expiresAt,
          status: "PENDING",
          metadata: options.metadata || {},
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const createdIntent = await BookingIntent.findById(intent[0]._id).populate(
      "slotId"
    );

    return createdIntent;
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent creation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

export const confirmBookingIntent = async (
  intentId,
  paymentId,
  paymentData = {}
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const intent = await BookingIntent.findById(intentId).session(session);

    if (!intent) {
      throw new ApiError(404, "Booking intent not found");
    }

    if (intent.status !== "PENDING") {
      throw new ApiError(400, `Intent is ${intent.status.toLowerCase()}`);
    }

    if (intent.isExpired) {
      throw new ApiError(400, "Intent has expired");
    }

    const payment = await Payment.create(
      [
        {
          bookingIntentId: intent._id,
          userId: intent.userId,
          amount: intent.amount,
          currency: intent.currency,
          status: "SUCCEEDED",
          paymentMethod: paymentData.paymentMethod || "CARD",
          paymentGateway: paymentData.gateway || "STRIPE",
          gatewayPaymentId: paymentId,
          gatewayResponse: paymentData.gatewayResponse || {},
          metadata: paymentData.metadata || {},
        },
      ],
      { session }
    );

    const booking = await createBooking(intent.userId, intent.slotId);

    payment[0].bookingId = booking._id;
    await payment[0].save({ session });

    intent.status = "CONFIRMED";
    intent.paymentIntentId = paymentId;
    await intent.save({ session });

    await session.commitTransaction();

    return {
      booking,
      payment: payment[0],
      intent,
    };
  } catch (error) {
    await session.abortTransaction();

    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent confirmation failed: ${error.message}`);
  } finally {
    session.endSession();
  }
};

export const cancelBookingIntent = async (intentId, userId) => {
  try {
    const intent = await BookingIntent.findById(intentId);

    if (!intent) {
      throw new ApiError(404, "Booking intent not found");
    }

    if (intent.userId.toString() !== userId.toString()) {
      throw new ApiError(403, "Not authorized to cancel this intent");
    }

    if (intent.status !== "PENDING") {
      throw new ApiError(
        400,
        `Cannot cancel ${intent.status.toLowerCase()} intent`
      );
    }

    intent.status = "CANCELLED";
    await intent.save();

    return intent;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent cancellation failed: ${error.message}`);
  }
};

export const expireBookingIntent = async (intentId) => {
  try {
    const intent = await BookingIntent.findById(intentId);

    if (!intent) {
      throw new ApiError(404, "Booking intent not found");
    }

    if (intent.status !== "PENDING") {
      return intent; 
    }

    intent.status = "EXPIRED";
    await intent.save();

    return intent;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Intent expiration failed: ${error.message}`);
  }
};

export const getUserIntents = async (userId, status = null) => {
  try {
    const filter = { userId };

    if (status) {
      if (!["PENDING", "CONFIRMED", "EXPIRED", "CANCELLED"].includes(status)) {
        throw new ApiError(
          400,
          "Invalid status. Use PENDING, CONFIRMED, EXPIRED, or CANCELLED"
        );
      }
      filter.status = status;
    }

    const intents = await BookingIntent.find(filter)
      .populate("slotId")
      .sort({ createdAt: -1 });

    return intents;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to fetch intents: ${error.message}`);
  }
};

export const processPaymentWebhook = async (
  gatewayPaymentId,
  status,
  webhookData = {}
) => {
  try {
    
    let payment = await Payment.findByGatewayId(
      gatewayPaymentId,
      webhookData.gateway || "STRIPE"
    );

    if (!payment) {

      throw new ApiError(404, "Payment not found for gateway ID");
    }

    const previousStatus = payment.status;
    payment.status = status;
    payment.gatewayResponse = webhookData;
    await payment.save();

    if (
      status === "SUCCEEDED" &&
      previousStatus !== "SUCCEEDED" &&
      !payment.bookingId
    ) {
      const intent = await BookingIntent.findById(payment.bookingIntentId);

      if (intent && intent.status === "PENDING") {
        await confirmBookingIntent(intent._id.toString(), gatewayPaymentId, {
          gateway: payment.paymentGateway,
          paymentMethod: payment.paymentMethod,
          gatewayResponse: webhookData,
        });
      }
    }

    return payment;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Webhook processing failed: ${error.message}`);
  }
};

export const createStripeCheckoutSession = async (
  bookingIntentId,
  successUrl,
  cancelUrl
) => {
  
  if (!stripe) {
    throw new ApiError(
      500,
      "Stripe is not configured. Set STRIPE_SECRET_KEY environment variable."
    );
  }

  const intent = await BookingIntent.findById(bookingIntentId).populate(
    "slotId"
  );

  if (!intent) {
    throw new ApiError(404, "BookingIntent not found");
  }

  if (intent.status === "CONFIRMED") {
    throw new ApiError(400, "BookingIntent already confirmed");
  }

  if (intent.status === "EXPIRED" || intent.status === "CANCELLED") {
    throw new ApiError(400, `BookingIntent is ${intent.status.toLowerCase()}`);
  }

  if (intent.expiresAt <= new Date()) {
    throw new ApiError(400, "BookingIntent has expired");
  }

  if (!intent.slotId) {
    throw new ApiError(404, "Slot not found");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"], 
      line_items: [
        {
          price_data: {
            currency: intent.currency.toLowerCase(), 
            product_data: {
              name: "Appointment Booking",
              description: `Slot: ${new Date(
                intent.slotId.startTime
              ).toLocaleString()} - ${new Date(
                intent.slotId.endTime
              ).toLocaleString()}`,
            },
            unit_amount: Math.round(intent.amount * 100), 
            
          },
          quantity: 1,
        },
      ],
      mode: "payment", 
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,

      metadata: {
        bookingIntentId: bookingIntentId.toString(),
        slotId: intent.slotId._id.toString(),
        userId: intent.userId.toString(),

      },

      expires_at: Math.floor(intent.expiresAt.getTime() / 1000), 
      
    });

    intent.stripeSessionId = session.id;
    intent.stripePaymentIntentId = session.payment_intent; 
    intent.status = "PAYMENT_PENDING";
    await intent.save();

    return {
      checkoutUrl: session.url, 
      sessionId: session.id,
      expiresAt: intent.expiresAt,
    };
  } catch (stripeError) {
    throw new ApiError(
      500,
      `Stripe session creation failed: ${stripeError.message}`
    );
  }
};

export const handleStripeWebhook = async (rawBody, signature) => {
  
  if (!stripe) {
    throw new ApiError(500, "Stripe is not configured");
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new ApiError(500, "Stripe webhook secret is not configured");
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new ApiError(
      400,
      `Webhook signature verification failed: ${err.message}`
    );
  }

  const existingPayment = await Payment.findOne({
    stripeEventId: event.id,
  });

  if (existingPayment) {
    console.log(`Event ${event.id} already processed, skipping`);
    return {
      message: "Event already processed",
      eventId: event.id,
      duplicate: true,
    };
  }

  let result;
  switch (event.type) {
    case "checkout.session.completed":
      result = await handleCheckoutSessionCompleted(event);
      break;

    case "payment_intent.succeeded":
      result = await handlePaymentIntentSucceeded(event);
      break;

    case "payment_intent.payment_failed":
      result = await handlePaymentIntentFailed(event);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
      return {
        message: "Event type not handled",
        eventType: event.type,
      };
  }

  return result;
};

const handleCheckoutSessionCompleted = async (event) => {
  const session = event.data.object;
  const { bookingIntentId } = session.metadata;

  const intent = await BookingIntent.findById(bookingIntentId);
  if (!intent) {
    console.error(
      `BookingIntent ${bookingIntentId} not found for event ${event.id}`
    );
    return { error: "BookingIntent not found" };
  }

  if (session.payment_intent) {
    intent.stripePaymentIntentId = session.payment_intent;
    await intent.save();
  }

  await Payment.create({
    bookingIntentId: intent._id,
    userId: intent.userId,
    amount: intent.amount,
    currency: intent.currency,
    status: "PROCESSING", 
    paymentMethod: "CARD",
    paymentGateway: "STRIPE",
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent,
    stripeEventId: event.id, 
    gatewayResponse: event, 
  });

  return {
    message: "Checkout session completed, awaiting payment confirmation",
    bookingIntentId,
  };
};

const handlePaymentIntentSucceeded = async (event) => {
  const paymentIntent = event.data.object;

  const intent = await BookingIntent.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (!intent) {
    console.error(
      `BookingIntent not found for payment intent ${paymentIntent.id}`
    );
    return { error: "BookingIntent not found" };
  }

  if (intent.status === "CONFIRMED") {
    console.log(`BookingIntent ${intent._id} already confirmed, skipping`);
    return {
      message: "Booking already confirmed",
      bookingIntentId: intent._id,
    };
  }

  if (intent.expiresAt <= new Date()) {
    
    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      {
        status: "SUCCEEDED",
        notes:
          "Payment succeeded but BookingIntent expired - requires manual refund",
      }
    );

    throw new ApiError(
      500,
      "Payment succeeded but BookingIntent expired. Manual refund required."
    );
  }

  try {

    const booking = await createBooking(
      intent.userId.toString(),
      intent.slotId.toString(),
      {
        answers: intent.metadata?.answers || {},
        notes: intent.metadata?.notes || "",
      }
    );

    await Payment.findOneAndUpdate(
      { bookingIntentId: intent._id },
      {
        status: "SUCCEEDED",
        bookingId: booking._id, 
        stripePaymentIntentId: paymentIntent.id,
        stripeEventId: event.id,
        gatewayResponse: event,
      },
      { upsert: true } 
    );

    intent.status = "CONFIRMED";
    await intent.save();

    return {
      message: "Booking confirmed successfully",
      bookingIntentId: intent._id,
      bookingId: booking._id,
    };
  } catch (bookingError) {

    console.error("Booking creation failed after payment:", bookingError);

    await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      {
        status: "SUCCEEDED",
        notes: `Payment succeeded but booking failed: ${bookingError.message}. Requires manual refund.`,
        gatewayResponse: event,
      }
    );

    throw new ApiError(
      500,
      `Payment succeeded but booking failed: ${bookingError.message}. Support team notified.`
    );
  }
};

const handlePaymentIntentFailed = async (event) => {
  const paymentIntent = event.data.object;

  const intent = await BookingIntent.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (!intent) {
    console.error(
      `BookingIntent not found for failed payment ${paymentIntent.id}`
    );
    return { error: "BookingIntent not found" };
  }

  intent.status = "EXPIRED";
  await intent.save();

  await Payment.findOneAndUpdate(
    { bookingIntentId: intent._id },
    {
      status: "FAILED",
      stripePaymentIntentId: paymentIntent.id,
      stripeEventId: event.id,
      notes: `Payment failed: ${
        paymentIntent.last_payment_error?.message || "Unknown error"
      }`,
      gatewayResponse: event,
    },
    { upsert: true }
  );

  return {
    message: "Payment failed, BookingIntent expired",
    bookingIntentId: intent._id,
    reason: paymentIntent.last_payment_error?.message || "Unknown error",
  };
};

export const getStripeSessionStatus = async (sessionId) => {
  if (!stripe) {
    throw new ApiError(500, "Stripe is not configured");
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      status: session.status, 
      paymentStatus: session.payment_status, 
      amountTotal: session.amount_total / 100, 
      currency: session.currency,
      paymentIntent: session.payment_intent,
    };
  } catch (stripeError) {
    throw new ApiError(
      500,
      `Failed to retrieve session: ${stripeError.message}`
    );
  }
};

export const getPaymentStatus = async (bookingIntentId) => {
  const intent = await BookingIntent.findById(bookingIntentId);
  if (!intent) {
    throw new ApiError(404, "BookingIntent not found");
  }

  const payment = await Payment.findOne({ bookingIntentId });

  return {
    intentStatus: intent.status,
    paymentStatus: payment?.status || "NO_PAYMENT",
    amount: intent.amount,
    currency: intent.currency,
    stripeSessionId: intent.stripeSessionId,
    stripePaymentIntentId: intent.stripePaymentIntentId,
    paymentMethod: payment?.paymentMethod,
    paymentGateway: payment?.paymentGateway,
    expiresAt: intent.expiresAt,
    isExpired: intent.expiresAt <= new Date(),
  };
};

export default {
  createBookingIntent,
  confirmBookingIntent,
  cancelBookingIntent,
  expireBookingIntent,
  getUserIntents,
  processPaymentWebhook,
  
  createStripeCheckoutSession,
  handleStripeWebhook,
  getStripeSessionStatus,
  getPaymentStatus,
};
