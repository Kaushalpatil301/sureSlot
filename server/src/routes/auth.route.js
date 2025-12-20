import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  verifyEmail,
  resendEmailVerification,
  forgotPasswordRequest,
  resetForgotPassword,
  refreshAccessToken,
  getCurrentUser,
  changeCurrentPassword,
} from "../controllers/auth.controller.js";
import {
  userRegisterValidator,
  userLoginValidator,
  userChangeCurrentPasswordValidator,
  userForgotPasswordValidator,
  userResetForgotPasswordValidator,
} from "../validators/index.js";
import { validate } from "../middlewares/validate.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = Router();

router
  .route("/register")
  .post(authLimiter, ...userRegisterValidator(), validate, registerUser);

router.route("/login").post(authLimiter, ...userLoginValidator(), validate, loginUser);

router.get("/verify-email/:verificationToken", verifyEmail);
router.post("/resend-email-verification", emailVerificationLimiter, resendEmailVerification);
router.post("/forgot-password", passwordResetLimiter, ...userForgotPasswordValidator(), validate, forgotPasswordRequest);
router.post("/reset-password/:resetToken", passwordResetLimiter, ...userResetForgotPasswordValidator(), validate, resetForgotPassword);
router.post("/refresh-token", refreshAccessToken);

router.post("/logout", verifyJWT, logoutUser);
router.get("/current-user", verifyJWT, getCurrentUser);
router.post(
  "/change-password",
  verifyJWT,
  ...userChangeCurrentPasswordValidator(),
  validate,
  changeCurrentPassword
);

export default router;
