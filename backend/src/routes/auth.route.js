import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  signup,
  login,
  logout,
  updateProfile,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/signup", signup);

router.post("/login", login);

router.post("/logout", logout);

router.put("/update-profile", protectRoute, updateProfile);

router.get("/check", protectRoute, (req, res) =>
  res.status(200).json(req.user)
);

export default router;
