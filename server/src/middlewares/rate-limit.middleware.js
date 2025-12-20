import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/api-error.js";

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    throw new ApiError(429, "Too many requests, please try again later");
  },
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: "Too many login attempts, please try again after 15 minutes",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many authentication attempts, please try again after 15 minutes"
    );
  },
});

// Medium rate limiter for password reset
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 requests per hour
  message: "Too many password reset attempts, please try again after an hour",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many password reset attempts, please try again after an hour"
    );
  },
});

// Email verification limiter
export const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per 15 minutes
  message: "Too many verification email requests, please try again later",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many verification email requests, please try again later"
    );
  },
});
