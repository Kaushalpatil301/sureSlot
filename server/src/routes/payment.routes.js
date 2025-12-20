import { Router } from "express";
import express from "express";
import {
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
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/intents", verifyJWT, createIntent);

router.get("/intents", verifyJWT, getIntents);

router.get("/intents/:intentId", verifyJWT, getIntentById);

router.post("/intents/:intentId/confirm", verifyJWT, confirmIntent);

router.delete("/intents/:intentId", verifyJWT, cancelIntent);

router.post("/webhooks", handleWebhook);

router.post(
  "/stripe/create-checkout-session",
  verifyJWT,
  createCheckoutSession
);

router.post("/stripe/webhook", handleStripeWebhookController);

router.get("/stripe/session/:sessionId/status", verifyJWT, getSessionStatus);

router.get("/intents/:intentId/status", verifyJWT, getIntentPaymentStatus);

export default router;
