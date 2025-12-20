/**
 * Production Hardening - Request Correlation & Structured Logging
 *
 * WHY correlation IDs:
 * - Track single request across multiple services
 * - Debug issues in production logs
 * - Link payment webhooks to booking flow
 * - Essential for distributed systems
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Generates correlation ID and attaches to request
 * Also sets up request-scoped logger
 */
export const correlationMiddleware = (req, res, next) => {
  // Use existing correlation ID from header or generate new one
  // WHY check header: Allows correlation across services
  const correlationId =
    req.headers["x-correlation-id"] || req.headers["x-request-id"] || uuidv4();

  // Attach to request object
  req.correlationId = correlationId;

  // Add to response headers for client tracking
  res.setHeader("X-Correlation-ID", correlationId);

  // Create request-scoped logger
  req.logger = createRequestLogger(correlationId, req);

  next();
};

/**
 * Creates structured logger with correlation ID
 */
function createRequestLogger(correlationId, req) {
  const baseContext = {
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };

  return {
    info: (message, data = {}) => {
      console.log(
        JSON.stringify({
          level: "INFO",
          timestamp: new Date().toISOString(),
          message,
          ...baseContext,
          ...data,
        })
      );
    },

    warn: (message, data = {}) => {
      console.warn(
        JSON.stringify({
          level: "WARN",
          timestamp: new Date().toISOString(),
          message,
          ...baseContext,
          ...data,
        })
      );
    },

    error: (message, error, data = {}) => {
      console.error(
        JSON.stringify({
          level: "ERROR",
          timestamp: new Date().toISOString(),
          message,
          error: {
            message: error?.message,
            stack:
              process.env.NODE_ENV === "development" ? error?.stack : undefined,
            code: error?.code,
          },
          ...baseContext,
          ...data,
        })
      );
    },

    // Critical business events (booking created, payment succeeded, etc.)
    audit: (event, data = {}) => {
      console.log(
        JSON.stringify({
          level: "AUDIT",
          timestamp: new Date().toISOString(),
          event,
          ...baseContext,
          ...data,
        })
      );
    },
  };
}

/**
 * Standalone logger for background jobs and non-request contexts
 */
export const logger = {
  info: (message, data = {}) => {
    console.log(
      JSON.stringify({
        level: "INFO",
        timestamp: new Date().toISOString(),
        message,
        ...data,
      })
    );
  },

  warn: (message, data = {}) => {
    console.warn(
      JSON.stringify({
        level: "WARN",
        timestamp: new Date().toISOString(),
        message,
        ...data,
      })
    );
  },

  error: (message, error, data = {}) => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        timestamp: new Date().toISOString(),
        message,
        error: {
          message: error?.message,
          stack:
            process.env.NODE_ENV === "development" ? error?.stack : undefined,
          code: error?.code,
        },
        ...data,
      })
    );
  },

  audit: (event, data = {}) => {
    console.log(
      JSON.stringify({
        level: "AUDIT",
        timestamp: new Date().toISOString(),
        event,
        ...data,
      })
    );
  },
};

/**
 * Request logging middleware (log start and end of requests)
 */
export const requestLoggingMiddleware = (req, res, next) => {
  const start = Date.now();

  // Log request start (only in development to avoid noise)
  if (process.env.NODE_ENV === "development") {
    req.logger.info("Request started", {
      query: req.query,
      body: sanitizeBody(req.body),
    });
  }

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - start;

    // Always log slow requests (>1s)
    if (duration > 1000) {
      req.logger.warn("Slow request detected", {
        duration,
        statusCode: res.statusCode,
      });
    }

    // Log errors (4xx, 5xx)
    if (res.statusCode >= 400) {
      req.logger.error("Request failed", null, {
        statusCode: res.statusCode,
        duration,
      });
    }
  });

  next();
};

/**
 * Sanitizes request body for logging (removes sensitive fields)
 */
function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;

  const sensitive = [
    "password",
    "token",
    "secret",
    "apiKey",
    "cardNumber",
    "cvv",
    "ssn",
  ];

  const sanitized = { ...body };

  Object.keys(sanitized).forEach((key) => {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    }
  });

  return sanitized;
}
