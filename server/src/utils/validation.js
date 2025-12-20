

import { ApiError } from "./api-error.js";
import mongoose from "mongoose";

export const validateObjectId = (id, fieldName = "ID") => {
  if (!id) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${fieldName} format`);
  }

  return true;
};

export const validateFutureDate = (date, fieldName = "date") => {
  const dateObj = new Date(date);

  if (isNaN(dateObj.getTime())) {
    throw new ApiError(400, `Invalid ${fieldName} format`);
  }

  if (dateObj <= new Date()) {
    throw new ApiError(400, `${fieldName} must be in the future`);
  }

  return dateObj;
};

export const validateDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    throw new ApiError(400, "Invalid start date format");
  }

  if (isNaN(end.getTime())) {
    throw new ApiError(400, "Invalid end date format");
  }

  if (end <= start) {
    throw new ApiError(400, "End date must be after start date");
  }

  const maxRangeDays = 365; 
  const rangeDays = (end - start) / (1000 * 60 * 60 * 24);

  if (rangeDays > maxRangeDays) {
    throw new ApiError(400, `Date range cannot exceed ${maxRangeDays} days`);
  }

  return { start, end };
};

export const validatePositiveNumber = (
  value,
  fieldName = "value",
  options = {}
) => {
  const num = Number(value);

  if (isNaN(num)) {
    throw new ApiError(400, `${fieldName} must be a valid number`);
  }

  if (num < 0) {
    throw new ApiError(400, `${fieldName} must be positive`);
  }

  if (options.min !== undefined && num < options.min) {
    throw new ApiError(400, `${fieldName} must be at least ${options.min}`);
  }

  if (options.max !== undefined && num > options.max) {
    throw new ApiError(400, `${fieldName} must be at most ${options.max}`);
  }

  return num;
};

export const validateString = (value, fieldName = "field", options = {}) => {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} must be a string`);
  }

  if (options.required && !value.trim()) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  if (options.minLength && value.length < options.minLength) {
    throw new ApiError(
      400,
      `${fieldName} must be at least ${options.minLength} characters`
    );
  }

  if (options.maxLength && value.length > options.maxLength) {
    throw new ApiError(
      400,
      `${fieldName} must be at most ${options.maxLength} characters`
    );
  }

  if (options.pattern && !options.pattern.test(value)) {
    throw new ApiError(400, `${fieldName} has invalid format`);
  }

  return value.trim();
};

export const validateEnum = (value, allowedValues, fieldName = "value") => {
  if (!allowedValues.includes(value)) {
    throw new ApiError(
      400,
      `Invalid ${fieldName}. Allowed values: ${allowedValues.join(", ")}`
    );
  }

  return value;
};

export const validateBookingAnswers = (answers) => {
  if (!answers) return {};

  if (typeof answers !== "object" || Array.isArray(answers)) {
    throw new ApiError(400, "Booking answers must be an object");
  }

  const maxQuestions = 50; 
  const maxAnswerLength = 1000; 

  const keys = Object.keys(answers);

  if (keys.length > maxQuestions) {
    throw new ApiError(
      400,
      `Too many booking questions (max: ${maxQuestions})`
    );
  }

  keys.forEach((key) => {
    
    if (key.length > 200) {
      throw new ApiError(400, "Question text too long");
    }

    const answer = answers[key];

    if (typeof answer === "string" && answer.length > maxAnswerLength) {
      throw new ApiError(
        400,
        `Answer for "${key}" is too long (max: ${maxAnswerLength} characters)`
      );
    }
  });

  return answers;
};

export const validatePagination = (page, limit) => {
  const pageNum = validatePositiveNumber(page || 1, "page", { min: 1 });
  const limitNum = validatePositiveNumber(limit || 10, "limit", {
    min: 1,
    max: 100, 
  });

  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
  };
};

export const validateURL = (url, fieldName = "URL", options = {}) => {
  if (!url) {
    if (options.required) {
      throw new ApiError(400, `${fieldName} is required`);
    }
    return null;
  }

  try {
    const urlObj = new URL(url);

    if (!["http:", "https:"].includes(urlObj.protocol)) {
      throw new ApiError(400, `${fieldName} must be HTTP or HTTPS`);
    }

    if (options.allowedDomains && options.allowedDomains.length > 0) {
      const isAllowed = options.allowedDomains.some((domain) =>
        urlObj.hostname.endsWith(domain)
      );

      if (!isAllowed) {
        throw new ApiError(400, `${fieldName} domain not allowed`);
      }
    }

    return url;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, `Invalid ${fieldName} format`);
  }
};

export const sanitizeMongoQuery = (query) => {
  if (!query || typeof query !== "object") return query;

  const sanitized = {};

  Object.keys(query).forEach((key) => {
    
    if (key.startsWith("$")) {
      return;
    }

    const value = query[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeMongoQuery(value);
    } else {
      sanitized[key] = value;
    }
  });

  return sanitized;
};

export const validateAmountMatch = (
  clientAmount,
  serverAmount,
  tolerance = 0.01
) => {
  const client = Number(clientAmount);
  const server = Number(serverAmount);

  if (isNaN(client) || isNaN(server)) {
    throw new ApiError(400, "Invalid amount format");
  }

  if (Math.abs(client - server) > tolerance) {
    throw new ApiError(400, "Amount mismatch. Please refresh and try again.");
  }

  return server; 
};
