import crypto from "crypto";
import { ApiError } from "../utils/api-error.js";

const tokenStore = new Map();

const generateSecureToken = () => {

  const token = crypto.randomBytes(32).toString("base64url");

  return token;
};

export const createShareToken = (appointmentTypeId, appointmentType) => {
  try {
    
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    if (!appointmentType) {
      throw new ApiError(400, "Appointment type data is required");
    }

    const token = generateSecureToken();

    tokenStore.set(token, {
      appointmentTypeId,
      createdAt: new Date(),

      ownerId: appointmentType.userId || appointmentType.ownerId,
    });

    return token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to create share token: ${error.message}`);
  }
};

export const validateShareToken = (token) => {
  try {
    if (!token) {
      throw new ApiError(400, "Share token is required");
    }

    const tokenData = tokenStore.get(token);

    if (!tokenData) {

      throw new ApiError(404, "Invalid or revoked share token");
    }

    return {
      appointmentTypeId: tokenData.appointmentTypeId,
      ownerId: tokenData.ownerId,
      createdAt: tokenData.createdAt,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Token validation failed: ${error.message}`);
  }
};

export const revokeShareToken = (token) => {
  try {
    if (!token) {
      throw new ApiError(400, "Share token is required");
    }

    const deleted = tokenStore.delete(token);

    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Token revocation failed: ${error.message}`);
  }
};

export const revokeAllTokensForAppointment = (appointmentTypeId) => {
  try {
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    let revokedCount = 0;

    for (const [token, data] of tokenStore.entries()) {
      if (data.appointmentTypeId === appointmentTypeId) {
        tokenStore.delete(token);
        revokedCount++;
      }
    }

    return revokedCount;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Bulk token revocation failed: ${error.message}`);
  }
};

export const getExistingToken = (appointmentTypeId) => {
  try {
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    for (const [token, data] of tokenStore.entries()) {
      if (data.appointmentTypeId === appointmentTypeId) {
        return token;
      }
    }

    return null;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to get existing token: ${error.message}`);
  }
};

export const isAppointmentShared = (appointmentTypeId) => {
  return getExistingToken(appointmentTypeId) !== null;
};

export default {
  createShareToken,
  validateShareToken,
  revokeShareToken,
  revokeAllTokensForAppointment,
  getExistingToken,
  isAppointmentShared,
};
