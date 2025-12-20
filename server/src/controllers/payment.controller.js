import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import {
  createBookingIntent,
  confirmBookingIntent,
  cancelBookingIntent,
  getUserIntents,
  processPaymentWebhook,
  
  createStripeCheckoutSession,
  handleStripeWebhook,
  getStripeSessionStatus,
  getPaymentStatus,
} from "../services/payment.service.js";

export const createIntent = asyncHandler(async (req, res) => {
  const { slotId, amount, currency, metadata } = req.body;
  const userId = req.user._id;

  if (!slotId) {
    throw new ApiError(400, "slotId is required");
  }

  if (amount === undefined || amount < 0) {
    throw new ApiError(400, "Valid amount is required");
  }

  const intent = await createBookingIntent(userId, slotId, amount, {
    currency,
    metadata,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        intent,
        expiresIn: intent.getRemainingTime(), 
      },
      "Booking intent created successfully"
    )
  );
});

export const confirmIntent = asyncHandler(async (req, res) => {
  const { intentId } = req.params;
  const { paymentId, paymentMethod, gateway, gatewayResponse, metadata } =
    req.body;

  if (!paymentId) {
    throw new ApiError(400, "paymentId is required");
  }

  const result = await confirmBookingIntent(intentId, paymentId, {
    paymentMethod,
    gateway,
    gatewayResponse,
    metadata,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Booking confirmed successfully"));
});

export const cancelIntent = asyncHandler(async (req, res) => {
  const { intentId } = req.params;
  const userId = req.user._id;

  const intent = await cancelBookingIntent(intentId, userId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, intent, "Booking intent cancelled successfully")
    );
});

export const getIntents = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;

  const intents = await getUserIntents(userId, status);

  return res
    .status(200)
    .json(
      new ApiResponse(200, intents, `Found ${intents.length} booking intent(s)`)
    );
});

export const getIntentById = asyncHandler(async (req, res) => {
  const { intentId } = req.params;
  const userId = req.user._id;

  const { BookingIntent } = await import("../models/bookingIntent.model.js");
  const intent = await BookingIntent.findById(intentId).populate("slotId");

  if (!intent) {
    throw new ApiError(404, "Booking intent not found");
  }

  if (intent.userId.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized to view this intent");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        intent,
        expiresIn: intent.getRemainingTime(),
        isExpired: intent.isExpired,
      },
      "Intent fetched successfully"
    )
  );
});

export const handleWebhook = asyncHandler(async (req, res) => {

  const { paymentId, status, gateway } = req.body;

  if (!paymentId || !status) {
    throw new ApiError(400, "paymentId and status are required");
  }

  const payment = await processPaymentWebhook(paymentId, status, {
    gateway: gateway || "STRIPE",
    ...req.body,
  });

  return res.status(200).json({
    success: true,
    message: "Webhook processed",
    paymentId: payment._id,
  });
});

export const createCheckoutSession = asyncHandler(async (req, res) => {
  const { bookingIntentId, successUrl, cancelUrl } = req.body;

  if (!bookingIntentId) {
    throw new ApiError(400, "bookingIntentId is required");
  }

  if (!successUrl || !cancelUrl) {
    throw new ApiError(400, "successUrl and cancelUrl are required");
  }

  if (!successUrl.startsWith("http") || !cancelUrl.startsWith("http")) {
    throw new ApiError(400, "URLs must be valid HTTP/HTTPS URLs");
  }

  const result = await createStripeCheckoutSession(
    bookingIntentId,
    successUrl,
    cancelUrl
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        checkoutUrl: result.checkoutUrl,
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
      },
      "Stripe Checkout session created successfully"
    )
  );
});

export const handleStripeWebhookController = asyncHandler(async (req, res) => {

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    throw new ApiError(400, "Missing stripe-signature header");
  }

  const rawBody = req.body; 

  const result = await handleStripeWebhook(rawBody, signature);

  return res.status(200).json({
    success: true,
    message: result.message,
    eventId: result.eventId || null,
  });
});

export const getSessionStatus = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    throw new ApiError(400, "sessionId is required");
  }

  const status = await getStripeSessionStatus(sessionId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        status,
        "Stripe session status retrieved successfully"
      )
    );
});

export const getIntentPaymentStatus = asyncHandler(async (req, res) => {
  const { intentId } = req.params;

  if (!intentId) {
    throw new ApiError(400, "intentId is required");
  }

  const status = await getPaymentStatus(intentId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, status, "Payment status retrieved successfully")
    );
});

export default {
  createIntent,
  confirmIntent,
  cancelIntent,
  getIntents,
  getIntentById,
  handleWebhook,
  
  createCheckoutSession,
  handleStripeWebhookController,
  getSessionStatus,
  getIntentPaymentStatus,
};
