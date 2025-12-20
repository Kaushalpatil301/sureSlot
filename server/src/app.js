import express from "express";
import cors from "cors";
import helmet from "helmet";

import compression from "compression";
import env from "./config/env.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

import availabilityRoutes from "./routes/availability.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import publicRoutes from "./routes/public.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.routes.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, 
  })
);

app.use(
  "/api/v1/payments/stripe/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json({ limit: "10mb" }));

app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(compression());

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

const API_PREFIX = "/api/v1";

app.use(`${API_PREFIX}/availability`, availabilityRoutes);
app.use(`${API_PREFIX}/bookings`, bookingRoutes);
app.use(`${API_PREFIX}/public`, publicRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/appointments`, appointmentRoutes);
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);

app.use(notFoundHandler);

app.use(errorHandler);

export default app;
