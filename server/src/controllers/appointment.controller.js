import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as appointmentService from "../services/appointment.service.js";

/**
 * Appointment Controller - Thin HTTP layer for appointment management
 *
 * WHY thin: All business logic in service, controller only handles HTTP
 */

/**
 * @route POST /api/v1/appointments
 * @desc Create new appointment type (draft)
 * @access Protected (requires login)
 */
export const createAppointmentType = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.createAppointmentType(
    req.user._id,
    req.body
  );

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        appointmentType,
        "Appointment type created successfully"
      )
    );
});

/**
 * @route PATCH /api/v1/appointments/:id
 * @desc Update appointment type
 * @access Protected (owner only)
 */
export const updateAppointmentType = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.updateAppointmentType(
    req.params.id,
    req.user._id,
    req.body
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointmentType,
        "Appointment type updated successfully"
      )
    );
});

/**
 * @route POST /api/v1/appointments/:id/publish
 * @desc Publish appointment type (triggers slot generation)
 * @access Protected (owner only)
 */
export const publishAppointmentType = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.publishAppointmentType(
    req.params.id,
    req.user._id
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointmentType,
        "Appointment type published successfully. Slots are being generated."
      )
    );
});

/**
 * @route POST /api/v1/appointments/:id/unpublish
 * @desc Unpublish appointment type
 * @access Protected (owner only)
 */
export const unpublishAppointmentType = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.unpublishAppointmentType(
    req.params.id,
    req.user._id
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointmentType,
        "Appointment type unpublished successfully"
      )
    );
});

/**
 * @route POST /api/v1/appointments/:id/share/enable
 * @desc Enable sharing (generates secure token)
 * @access Protected (owner only)
 */
export const enableSharing = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.enableSharing(
    req.params.id,
    req.user._id
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        shareToken: appointmentType.shareToken,
        shareUrl: `${req.protocol}://${req.get(
          "host"
        )}/api/v1/public/appointments/${appointmentType.shareToken}`,
      },
      "Sharing enabled successfully"
    )
  );
});

/**
 * @route POST /api/v1/appointments/:id/share/disable
 * @desc Disable sharing (revokes token)
 * @access Protected (owner only)
 */
export const disableSharing = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.disableSharing(
    req.params.id,
    req.user._id
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, appointmentType, "Sharing disabled successfully")
    );
});

/**
 * @route DELETE /api/v1/appointments/:id
 * @desc Soft delete appointment type
 * @access Protected (owner only)
 */
export const deleteAppointmentType = asyncHandler(async (req, res) => {
  await appointmentService.deleteAppointmentType(req.params.id, req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, null, "Appointment type deleted successfully"));
});

/**
 * @route GET /api/v1/appointments
 * @desc Get all appointment types for logged-in user
 * @access Protected
 */
export const getAppointmentTypes = asyncHandler(async (req, res) => {
  const { isPublished, isShareEnabled } = req.query;

  const filters = {};
  if (isPublished !== undefined) filters.isPublished = isPublished === "true";
  if (isShareEnabled !== undefined)
    filters.isShareEnabled = isShareEnabled === "true";

  const appointmentTypes = await appointmentService.getAppointmentTypes(
    req.user._id,
    filters
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointmentTypes,
        "Appointment types retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/appointments/:id
 * @desc Get single appointment type
 * @access Protected (owner only)
 */
export const getAppointmentTypeById = asyncHandler(async (req, res) => {
  const appointmentType = await appointmentService.getAppointmentTypeById(
    req.params.id,
    req.user._id
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointmentType,
        "Appointment type retrieved successfully"
      )
    );
});

/**
 * @route GET /api/v1/appointments/public/list
 * @desc Get public appointment types (directory listing)
 * @access Public
 */
export const getPublicAppointmentTypes = asyncHandler(async (req, res) => {
  const { providerId } = req.query;

  const filters = {};
  if (providerId) filters.providerId = providerId;

  const appointmentTypes = await appointmentService.getPublicAppointmentTypes(
    filters
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointmentTypes,
        "Public appointment types retrieved successfully"
      )
    );
});
