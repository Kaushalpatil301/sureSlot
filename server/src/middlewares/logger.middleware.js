

import { v4 as uuidv4 } from "uuid";

export const correlationMiddleware = (req, res, next) => {

  const correlationId =
    req.headers["x-correlation-id"] || req.headers["x-request-id"] || uuidv4();

  req.correlationId = correlationId;

  res.setHeader("X-Correlation-ID", correlationId);

  req.logger = createRequestLogger(correlationId, req);

  next();
};

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

export const requestLoggingMiddleware = (req, res, next) => {
  const start = Date.now();

  if (process.env.NODE_ENV === "development") {
    req.logger.info("Request started", {
      query: req.query,
      body: sanitizeBody(req.body),
    });
  }

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (duration > 1000) {
      req.logger.warn("Slow request detected", {
        duration,
        statusCode: res.statusCode,
      });
    }

    if (res.statusCode >= 400) {
      req.logger.error("Request failed", null, {
        statusCode: res.statusCode,
        duration,
      });
    }
  });

  next();
};

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
