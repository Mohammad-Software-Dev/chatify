import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

export const generateToken = (userId, res) => {
  const { JWT_SECRET } = ENV;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "7d",
  });

  const cookieSameSite = ENV.COOKIE_SAMESITE || "strict";
  const cookieSecure =
    ENV.COOKIE_SECURE !== undefined
      ? ENV.COOKIE_SECURE === "true"
      : ENV.NODE_ENV === "development"
      ? false
      : true;

  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // MS
    httpOnly: true, // prevent XSS attacks: cross-site scripting
    sameSite: cookieSameSite,
    secure: cookieSecure,
  });

  return token;
};
