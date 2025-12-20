import { Router } from "express";
import {
  getAvailability,
  checkAvailability,
  getCalendarAvailability,
} from "../controllers/availability.controller.js";

const router = Router();

router.get("/", getAvailability);

router.get("/check", checkAvailability);

router.get("/calendar", getCalendarAvailability);

export default router;
