import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import jwt from "jsonwebtoken";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "Unauthorized request");
  }

  const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

  const user = await User.findById(decodedToken?._id).select(
    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry"
  );

  if (!user) {
    throw new ApiError(401, "Invalid access token");
  }

  req.user = user;
  next();
});

/**
 * Middleware to ensure user has ADMIN role
 * WHY separate middleware: Allows role-based access control (RBAC)
 * - Can be composed with verifyJWT: verifyJWT → requireAdmin
 * - Reusable across multiple admin routes
 * - Clear separation: authentication (verifyJWT) vs authorization (requireAdmin)
 *
 * MUST be used after verifyJWT (requires req.user to be set)
 */
export const requireAdmin = asyncHandler(async (req, res, next) => {
  // WHY check req.user: verifyJWT must run first to populate req.user
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  // WHY strict equality: Prevents "admin" !== "ADMIN" bugs
  if (req.user.role !== "ADMIN") {
    throw new ApiError(403, "Access denied. Admin privileges required.");
  }

  next();
});

/**
 * Middleware to ensure user has ORGANISER or ADMIN role
 * WHY organiser access: Organisers need to manage their own appointment types and slots
 * ADMIN has all ORGANISER permissions (role hierarchy)
 */
export const requireOrganiser = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (req.user.role !== "ORGANISER" && req.user.role !== "ADMIN") {
    throw new ApiError(
      403,
      "Access denied. Organiser or Admin privileges required."
    );
  }

  next();
});
