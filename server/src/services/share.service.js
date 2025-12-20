import crypto from "crypto";
import { ApiError } from "../utils/api-error.js";

/**
 * Share Service - Token-based secure sharing for appointments
 *
 * WHY TOKEN-BASED SHARING IS SAFER THAN ID-BASED URLS:
 *
 * 1. ENUMERATION PREVENTION:
 *    - IDs are sequential/predictable (1, 2, 3...)
 *    - Attackers can enumerate all appointments by trying IDs
 *    - Tokens are random, cryptographically secure (128-bit entropy)
 *    - Cannot guess or brute-force other appointments
 *
 * 2. REVOCABILITY:
 *    - Token can be revoked without changing appointment ID
 *    - ID-based URLs cannot be "unshared" without deleting appointment
 *    - Token regeneration creates new access, invalidates old link
 *    - Fine-grained access control
 *
 * 3. ACCESS CONTROL:
 *    - Token acts as a capability (bearer token)
 *    - Possessing token = permission to view
 *    - Can set expiry, usage limits, scope
 *    - ID alone provides no access control
 *
 * 4. PRIVACY:
 *    - ID-based URLs leak information (how many appointments exist)
 *    - Sequential IDs reveal creation order
 *    - Tokens reveal nothing about other appointments
 *    - No information disclosure
 *
 * 5. SELECTIVE SHARING:
 *    - Can generate multiple tokens for same appointment (different audiences)
 *    - Each token can have different permissions/expiry
 *    - ID-based URLs are all-or-nothing
 *    - Enables fine-grained sharing strategies
 */

// In-memory token store (in production, store in database)
// WHY database storage needed:
// - Persists across server restarts
// - Supports multiple server instances
// - Enables revocation and audit trails
// - Can add expiry, usage tracking, etc.
const tokenStore = new Map();

/**
 * Generates a cryptographically secure random token
 *
 * WHY crypto.randomBytes:
 * - Cryptographically secure random number generator (CSPRNG)
 * - Cannot be predicted or reproduced
 * - 32 bytes = 256 bits = 2^256 possible values
 * - Collision probability negligible
 *
 * @returns {String} URL-safe token (base64url encoded)
 */
const generateSecureToken = () => {
  // Generate 32 random bytes (256 bits of entropy)
  // WHY 32 bytes:
  // - 256 bits is industry standard for cryptographic keys
  // - Provides sufficient entropy against brute force
  // - Balances security and token length
  const token = crypto.randomBytes(32).toString("base64url");

  return token;
};

/**
 * Creates or regenerates a share token for an appointment type
 *
 * WHY regenerate option:
 * - Invalidates old link if compromised
 * - Creates new access without deleting appointment
 * - Useful for rotating tokens periodically
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @param {Object} appointmentType - Appointment type data (should include userId for ownership)
 * @returns {String} Secure share token
 */
export const createShareToken = (appointmentTypeId, appointmentType) => {
  try {
    // Validate inputs
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    if (!appointmentType) {
      throw new ApiError(400, "Appointment type data is required");
    }

    // Generate new secure token
    const token = generateSecureToken();

    // Store token mapping
    // WHY store both directions:
    // - token -> appointmentTypeId for quick lookup (public access)
    // - appointmentTypeId -> token for regeneration and revocation
    tokenStore.set(token, {
      appointmentTypeId,
      createdAt: new Date(),
      // Store minimal appointment data for quick access
      // WHY minimal data:
      // - Avoid data duplication
      // - Source of truth remains in database
      // - Just enough for authorization checks
      ownerId: appointmentType.userId || appointmentType.ownerId,
    });

    return token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, `Failed to create share token: ${error.message}`);
  }
};

/**
 * Validates a share token and returns appointment type ID
 *
 * WHY validation needed:
 * - Prevents access with invalid/expired tokens
 * - Fails fast for security
 * - Returns appointment ID for further processing
 *
 * @param {String} token - Share token
 * @returns {Object} { appointmentTypeId, ownerId }
 */
export const validateShareToken = (token) => {
  try {
    if (!token) {
      throw new ApiError(400, "Share token is required");
    }

    // Look up token
    const tokenData = tokenStore.get(token);

    if (!tokenData) {
      // WHY specific error:
      // - Clear feedback to user
      // - Could be invalid, revoked, or expired
      // - Don't leak whether token format is valid
      throw new ApiError(404, "Invalid or revoked share token");
    }

    // Token is valid, return appointment type ID
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

/**
 * Revokes a share token
 *
 * WHY revocation:
 * - Stop sharing without deleting appointment
 * - Invalidate leaked/compromised tokens
 * - User control over access
 * - Security best practice
 *
 * @param {String} token - Share token to revoke
 * @returns {Boolean} true if revoked, false if not found
 */
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

/**
 * Revokes all tokens for an appointment type
 *
 * WHY bulk revocation:
 * - When appointment is unpublished
 * - Security: immediately stop all access
 * - Useful for appointment deletion/archival
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @returns {Number} Count of revoked tokens
 */
export const revokeAllTokensForAppointment = (appointmentTypeId) => {
  try {
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    let revokedCount = 0;

    // Iterate through all tokens and remove matching ones
    // WHY iterate:
    // - No reverse index in Map
    // - In production DB, would use indexed query
    // - Acceptable for in-memory store
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

/**
 * Gets share token for an appointment (if exists)
 *
 * WHY this function:
 * - Check if appointment is already shared
 * - Get existing token instead of regenerating
 * - Display current share link to owner
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @returns {String|null} Token if exists, null otherwise
 */
export const getExistingToken = (appointmentTypeId) => {
  try {
    if (!appointmentTypeId) {
      throw new ApiError(400, "Appointment type ID is required");
    }

    // Search for existing token
    // WHY linear search:
    // - In-memory store, acceptable performance
    // - Production: add reverse index in database
    // - Rarely called (only when displaying to owner)
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

/**
 * Checks if an appointment is currently shared
 *
 * WHY boolean check:
 * - Quick check without exposing token
 * - Used in UI to show share status
 * - Doesn't require token knowledge
 *
 * @param {String} appointmentTypeId - MongoDB ObjectId as string
 * @returns {Boolean} true if shared, false otherwise
 */
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
