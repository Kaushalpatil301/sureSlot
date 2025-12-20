import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/auth.middleware.js";
import * as adminController from "../controllers/admin.controller.js";

const router = Router();

router.get(
  "/reports/bookings",
  verifyJWT,
  requireAdmin,
  adminController.getTotalBookingsReport
);

router.get(
  "/reports/peak-hours",
  verifyJWT,
  requireAdmin,
  adminController.getPeakBookingHoursReport
);

router.get(
  "/reports/slot-utilization",
  verifyJWT,
  requireAdmin,
  adminController.getSlotUtilizationReport
);

router.get(
  "/reports/users",
  verifyJWT,
  requireAdmin,
  adminController.getUserStatisticsReport
);

router.get(
  "/reports/revenue",
  verifyJWT,
  requireAdmin,
  adminController.getRevenueReport
);

router.get(
  "/reports/booking-intents",
  verifyJWT,
  requireAdmin,
  adminController.getBookingIntentsReport
);

router.get(
  "/reports/providers",
  verifyJWT,
  requireAdmin,
  adminController.getProviderUtilizationReport
);

router.get(
  "/dashboard",
  verifyJWT,
  requireAdmin,
  adminController.getDashboardOverview
);

router.get("/users", verifyJWT, requireAdmin, adminController.getAllUsers);

router.get("/users/:id", verifyJWT, requireAdmin, adminController.getUserById);

router.put(
  "/users/:id/activate",
  verifyJWT,
  requireAdmin,
  adminController.activateUser
);

router.put(
  "/users/:id/deactivate",
  verifyJWT,
  requireAdmin,
  adminController.deactivateUser
);

router.put(
  "/users/:id/role",
  verifyJWT,
  requireAdmin,
  adminController.updateUserRole
);

router.get(
  "/bookings",
  verifyJWT,
  requireAdmin,
  adminController.getAllBookings
);

router.get(
  "/bookings/:id",
  verifyJWT,
  requireAdmin,
  adminController.getBookingById
);

router.get(
  "/providers",
  verifyJWT,
  requireAdmin,
  adminController.getAllProviders
);

export default router;
