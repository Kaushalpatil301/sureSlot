import { ApiError } from "../utils/api-error.js";
import env from "../config/env.js";

/**
 * Global error handling middleware
 * Catches all errors from routes and controllers
 * Formats errors into consistent API response
 * Prevents server crashes and information leakage
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle non-ApiError instances (e.g., mongoose errors, unexpected errors)
  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode || error instanceof mongoose.Error ? 400 : 500;

    const message = error.message || "Something went wrong";

    error = new ApiError(statusCode, message, error.errors || [], "");
  }

  // Prepare error response
  const response = {
    success: false,
    message: error.message,
    errors: error.errors,
    ...(env.NODE_ENV === "development" && { stack: error.stack }), // Only show stack in development
  };

  // Log error in development for debugging
  if (env.NODE_ENV === "development") {
    console.error("🔴 Error:", {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // Send error response
  return res.status(error.statusCode).json(response);
};

/**
 * Handles 404 Not Found errors
 * Catches requests to undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(
    404,
    `Route not found: ${req.method} ${req.originalUrl}`
  );
  next(error);
};

export { errorHandler, notFoundHandler };
