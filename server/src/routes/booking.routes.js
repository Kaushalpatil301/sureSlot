import { Router } from "express";
import {
  createBookingController,
  getUserBookingsController,
  getBookingByIdController,
  cancelBookingController,
} from "../controllers/booking.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/", createBookingController);

router.get("/", getUserBookingsController);

router.get("/:bookingId", getBookingByIdController);

router.delete("/:bookingId", cancelBookingController);

export default router;
