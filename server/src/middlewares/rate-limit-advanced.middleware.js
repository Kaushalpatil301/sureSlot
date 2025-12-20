/**
 * Production Hardening - Advanced Rate Limiting
 *
 * WHY multiple rate limiters:
 * - Prevent abuse of public APIs (scraping, DOS)
 * - Protect payment endpoints from fraud
 * - Prevent brute-force attacks on share links
 * - Different endpoints have different risk profiles
 */

import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/api-error.js";

// ============ EXISTING LIMITERS (from your code) ============

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new ApiError(429, "Too many requests, please try again later");
  },
});

// Strict rate limiter for authentication endpoints
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

// Medium rate limiter for password reset
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

// Email verification limiter
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

// ============ NEW PRODUCTION HARDENING LIMITERS ============

/**
 * Public availability API limiter
 * WHY: Public endpoints can be abused for scraping or DOS
 * More lenient than auth but still protected
 */
export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Higher limit for public APIs
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new ApiError(429, "Too many requests, please try again later");
  },
});

/**
 * Share link access limiter (per token)
 * WHY: Prevent brute-force attacks on share tokens
 * Track by token + IP combination
 */
export const shareLinkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 50, // 50 requests per token per IP per 10 min
  keyGenerator: (req) => {
    // Combine shareToken from params/query and IP
    const token = req.params.shareToken || req.query.shareToken || "unknown";
    return `${token}:${req.ip}`;
  },
  skipSuccessfulRequests: false, // Count all requests
  message: "Too many attempts to access this share link",
  handler: (req, res) => {
    throw new ApiError(
      429,
      "Too many attempts to access this share link. Please try again later."
    );
  },
});

/**
 * Booking creation limiter (per user)
 * WHY: Prevent spam bookings, accidental duplicate clicks
 * Track by user ID (if authenticated) or IP
 */
export const bookingCreationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Max 10 booking attempts per 5 minutes
  keyGenerator: (req) => {
    // Use userId if available (authenticated), otherwise IP
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

/**
 * Payment intent creation limiter
 * WHY: Prevent payment fraud, spam intents
 * Stricter than booking because payment intents reserve slots
 */
export const paymentIntentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 payment intents per 10 minutes per user
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

/**
 * Stripe webhook limiter
 * WHY: Even though webhooks have signature verification, rate limit as defense in depth
 * More lenient because Stripe may retry failed webhooks
 */
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhook events per minute
  keyGenerator: (req) => {
    // Use Stripe signature as key (unique per event)
    return req.headers["stripe-signature"] || req.ip;
  },
  skipSuccessfulRequests: true, // Don't count successful webhooks
  message: "Too many webhook requests",
  handler: (req, res) => {
    // For webhooks, return simple JSON (no exception)
    res.status(429).json({
      success: false,
      message: "Too many requests, please retry later",
    });
  },
});

/**
 * Admin report generation limiter
 * WHY: Reports are expensive queries, prevent DOS
 */
export const adminReportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Max 20 report generations per 5 minutes
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

/**
 * Slot generation limiter (admin only)
 * WHY: Slot generation is expensive, prevent accidental DOS
 */
export const slotGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Max 10 slot generations per 5 minutes
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
