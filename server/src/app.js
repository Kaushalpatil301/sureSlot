import express from "express";
import cors from "cors";
import helmet from "helmet";
// import mongoSanitize from "express-mongo-sanitize"; // Disabled - Express 5 compatibility issue
import compression from "compression";
import env from "./config/env.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

// Import routes
import availabilityRoutes from "./routes/availability.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import publicRoutes from "./routes/public.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import authRoutes from "./routes/auth.route.js";

/**
 * Initialize Express application
 * Sets up all middlewares and routes
 * Does not start server (that's server.js responsibility)
 */
const app = express();

// ===========================
// Security Middlewares
// ===========================

// Helmet: Sets various HTTP headers for security
app.use(helmet());

// CORS: Enable Cross-Origin Resource Sharing
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // Allow cookies/auth headers
  })
);

// Mongo Sanitize: Prevent NoSQL injection attacks
// DISABLED: Compatibility issue with Express 5 - validation handled in routes
// app.use(mongoSanitize());

// ===========================
// Request Processing Middlewares
// ===========================

// CRITICAL: Stripe webhook MUST be registered BEFORE express.json()
// WHY: Stripe signature verification requires raw body (not parsed JSON)
// This route needs raw body as Buffer for signature verification
app.use(
  "/api/v1/payments/stripe/webhook",
  express.raw({ type: "application/json" })
);

// Body parser: Parse JSON payloads (limit to prevent DoS)
app.use(express.json({ limit: "10mb" }));

// URL-encoded parser: Parse form data
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Compression: Gzip responses for better performance
app.use(compression());

// ===========================
// Health Check Route
// ===========================

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ===========================
// API Routes
// ===========================

// Base API path
const API_PREFIX = "/api/v1";

// API Routes
app.use(`${API_PREFIX}/availability`, availabilityRoutes);
app.use(`${API_PREFIX}/bookings`, bookingRoutes);
app.use(`${API_PREFIX}/public`, publicRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/appointments`, appointmentRoutes);
app.use(`${API_PREFIX}/auth`, authRoutes);

// ===========================
// Error Handling
// ===========================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
