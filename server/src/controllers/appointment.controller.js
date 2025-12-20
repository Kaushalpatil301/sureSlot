import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as appointmentService from "../services/appointment.service.js";

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
        shareUrl: `${req.protocol}:
          "host"
        )}/api/v1/public/appointments/${appointmentType.shareToken}`,
      },
      "Sharing enabled successfully"
    )
  );
});

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

export const deleteAppointmentType = asyncHandler(async (req, res) => {
  await appointmentService.deleteAppointmentType(req.params.id, req.user._id);

  res
    .status(200)
    .json(new ApiResponse(200, null, "Appointment type deleted successfully"));
});

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

export const getAppointmentBookings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, startDate, endDate, page, limit } = req.query;

  const result = await appointmentService.getAppointmentBookings(
    id,
    req.user._id,
    { status, startDate, endDate, page, limit }
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Appointment bookings retrieved successfully"
      )
    );
});

export const getAppointmentPreview = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.getAppointmentPreview(id);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        appointment,
        "Appointment preview retrieved successfully"
      )
    );
});
