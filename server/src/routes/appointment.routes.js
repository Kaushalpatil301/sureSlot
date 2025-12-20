import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import * as appointmentController from "../controllers/appointment.controller.js";

const router = Router();

router.get("/", verifyJWT, appointmentController.getAppointmentTypes);

router.get("/:id", verifyJWT, appointmentController.getAppointmentTypeById);

router.post("/", verifyJWT, appointmentController.createAppointmentType);

router.patch("/:id", verifyJWT, appointmentController.updateAppointmentType);

router.delete("/:id", verifyJWT, appointmentController.deleteAppointmentType);

router.post(
  "/:id/publish",
  verifyJWT,
  appointmentController.publishAppointmentType
);

router.post(
  "/:id/unpublish",
  verifyJWT,
  appointmentController.unpublishAppointmentType
);

router.post(
  "/:id/share/enable",
  verifyJWT,
  appointmentController.enableSharing
);

router.post(
  "/:id/share/disable",
  verifyJWT,
  appointmentController.disableSharing
);

router.get("/public/list", appointmentController.getPublicAppointmentTypes);

router.get(
  "/:id/bookings",
  verifyJWT,
  appointmentController.getAppointmentBookings
);

router.get("/:id/preview", appointmentController.getAppointmentPreview);

export default router;
