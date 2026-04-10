import bcrypt from "bcryptjs";
import { ENV } from "./env.js";
import User from "../models/User.js";

const normalizeUsername = (username) => username?.trim().toLowerCase();

const requiredAdminEnv = ["ADMIN_USERNAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"];

export const seedAdmin = async ({ env = ENV } = {}) => {
  const missing = requiredAdminEnv.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required admin env vars: ${missing.join(", ")}`);
  }

  const username = normalizeUsername(env.ADMIN_USERNAME);
  if (!username) {
    throw new Error("ADMIN_USERNAME is required.");
  }

  const existing = await User.findOne({ username })
    .select("-password")
    .lean();
  if (existing) {
    return { created: false, user: existing };
  }

  const password = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  const user = await User.create({
    fullName: env.ADMIN_FULL_NAME || "Chatify Admin",
    email: env.ADMIN_EMAIL,
    username,
    password,
  });

  const publicUser = user.toObject();
  delete publicUser.password;
  return { created: true, user: publicUser };
};
