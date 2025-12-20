import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// CORS configuration
app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN === "*"
        ? "*"
        : [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            process.env.CORS_ORIGIN,
          ],
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Routes
import authRouter from "./src/routes/auth.route.js";
import healthcheckRouter from "./src/routes/healthcheck.route.js";

// Route declarations
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/healthcheck", healthcheckRouter);

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "🚀 SureSlot API is running!",
    version: "1.0.0",
    endpoints: {
      auth: "/api/v1/auth",
      healthcheck: "/api/v1/healthcheck",
    },
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler - MUST BE LAST
app.use((err, req, res, next) => {
  console.error("🔥 Error:", {
    message: err.message,
    statusCode: err.statusCode,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || [],
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export { app };
