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

export const requireAdmin = asyncHandler(async (req, res, next) => {
  
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  if (req.user.role !== "ADMIN") {
    throw new ApiError(403, "Access denied. Admin privileges required.");
  }

  next();
});

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
