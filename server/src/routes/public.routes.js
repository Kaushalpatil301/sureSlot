import { Router } from "express";
import {
  getSharedAppointment,
  getSharedAvailability,
  bookViaToken,
} from "../controllers/public.controller.js";

const router = Router();

router.get("/appointments/:token", getSharedAppointment);

router.get("/availability/:token", getSharedAvailability);

router.post("/book/:token", bookViaToken);

export default router;
