import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/api-error.js";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true, 
  legacyHeaders: false, 
  handler: (req, res) => {
    throw new ApiError(429, "Too many requests, please try again later");
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  skipSuccessfulRequests: true, 
  message: "Too many login attempts, please try again after 15 minutes",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many authentication attempts, please try again after 15 minutes"
    );
  },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 3, 
  message: "Too many password reset attempts, please try again after an hour",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many password reset attempts, please try again after an hour"
    );
  },
});

export const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 3, 
  message: "Too many verification email requests, please try again later",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many verification email requests, please try again later"
    );
  },
});
