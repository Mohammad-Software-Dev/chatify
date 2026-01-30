import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  signup,
  login,
  logout,
  updateProfile,
  checkUsername,
  checkAuth,
  refreshSession,
} from "../controllers/auth.controller.js";
import { arcjetProtection } from "../middleware/arcjet.middleware.js";
import { authLimiter } from "../middleware/rate-limit.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  signupSchema,
  loginSchema,
  checkUsernameSchema,
  updateProfileSchema,
} from "../validators/index.js";

const router = express.Router();

router.use(arcjetProtection, authLimiter);

router.post("/signup", validate(signupSchema), signup);

router.post("/login", validate(loginSchema), login);

router.post("/logout", logout);

router.get("/check-username", validate(checkUsernameSchema), checkUsername);

router.post("/refresh", refreshSession);

router.put(
  "/update-profile",
  protectRoute,
  validate(updateProfileSchema),
  updateProfile
);

router.get("/check", protectRoute, checkAuth);

export default router;
