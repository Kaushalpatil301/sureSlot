

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

export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 200, 
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new ApiError(429, "Too many requests, please try again later");
  },
});

export const shareLinkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, 
  max: 50, 
  keyGenerator: (req) => {
    
    const token = req.params.shareToken || req.query.shareToken || "unknown";
    return `${token}:${req.ip}`;
  },
  skipSuccessfulRequests: false, 
  message: "Too many attempts to access this share link",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many attempts to access this share link. Please try again later."
    );
  },
});

export const bookingCreationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 10, 
  keyGenerator: (req) => {
    
    return req.user?._id?.toString() || req.ip;
  },
  skipSuccessfulRequests: false,
  message: "Too many booking attempts, please slow down",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many booking attempts. Please wait a few minutes before trying again."
    );
  },
});

export const paymentIntentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, 
  max: 5, 
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip;
  },
  skipSuccessfulRequests: false,
  message: "Too many payment attempts, please slow down",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many payment attempts. Please wait before creating another payment."
    );
  },
});

export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 100, 
  keyGenerator: (req) => {
    
    return req.headers["stripe-signature"] || req.ip;
  },
  skipSuccessfulRequests: true, 
  message: "Too many webhook requests",
  handler: (req, res) => {
    
    res.status(429).json({
      success: false,
      message: "Too many requests, please retry later",
    });
  },
});

export const adminReportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 20, 
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip;
  },
  message: "Too many report requests, please try again later",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many report requests. Please wait a few minutes."
    );
  },
});

export const slotGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 10, 
  keyGenerator: (req) => {
    return req.user?._id?.toString() || req.ip;
  },
  message: "Too many slot generation requests",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many slot generation requests. Please wait before generating more slots."
    );
  },
});
