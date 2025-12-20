import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import * as userController from "../controllers/user.controller.js";

const router = Router();

router.get("/me", verifyJWT, userController.getMyProfile);

router.put("/me", verifyJWT, userController.updateMyProfile);

router.get("/me/bookings", verifyJWT, userController.getMyBookings);

export default router;
