import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";
import env from "../config/env.js";

const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode || (error instanceof mongoose.Error ? 400 : 500);

    const message = error.message || "Something went wrong";

    error = new ApiError(
      statusCode,
      message,
      error.errors || [],
      error.stack || ""
    );
  }

  const response = {
    success: false,
    message: error.message,
    errors: error.errors || [],
    ...(env.NODE_ENV === "development" && { stack: error.stack }), 
  };

  if (env.NODE_ENV === "development") {
    console.error("🔴 Error:", {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
    });
  }

  return res.status(error.statusCode || 500).json(response);
};

const notFoundHandler = (req, res, next) => {
  const error = new ApiError(
    404,
    `Route not found: ${req.method} ${req.originalUrl}`
  );
  next(error);
};

export { errorHandler, notFoundHandler };
