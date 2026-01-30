import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "./env.js";

const parseDurationToMs = (value, fallbackMs) => {
  if (!value || typeof value !== "string") return fallbackMs;
  const match = value.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (multipliers[unit] || 1000);
};

const getCookieOptions = () => {
  const cookieSameSite = ENV.COOKIE_SAMESITE || "strict";
  const cookieSecure =
    ENV.COOKIE_SECURE !== undefined
      ? ENV.COOKIE_SECURE === "true"
      : ENV.NODE_ENV === "development"
      ? false
      : true;
  const cookieDomain = ENV.COOKIE_DOMAIN || undefined;
  const cookiePath = ENV.COOKIE_PATH || "/";
  return {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    domain: cookieDomain,
    path: cookiePath,
  };
};

export const generateAccessToken = (userId) => {
  const { JWT_SECRET } = ENV;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: ENV.JWT_ACCESS_TTL || "10m",
  });
};

export const generateRefreshToken = (userId) => {
  const { JWT_SECRET } = ENV;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  const tokenId = crypto.randomUUID();
  const token = jwt.sign({ userId, tokenId }, JWT_SECRET, {
    expiresIn: ENV.JWT_REFRESH_TTL || "7d",
  });
  return { token, tokenId };
};

export const setAuthCookies = (res, accessToken, refreshToken) => {
  const options = getCookieOptions();
  const accessMaxAge = parseDurationToMs(ENV.JWT_ACCESS_TTL, 10 * 60 * 1000);
  const refreshMaxAge = parseDurationToMs(
    ENV.JWT_REFRESH_TTL,
    7 * 24 * 60 * 60 * 1000
  );
  res.cookie("jwt", accessToken, {
    ...options,
    maxAge: accessMaxAge,
  });
  res.cookie("refresh", refreshToken, {
    ...options,
    maxAge: refreshMaxAge,
  });
};

export const clearAuthCookies = (res) => {
  const options = getCookieOptions();
  res.cookie("jwt", "", { ...options, maxAge: 0 });
  res.cookie("refresh", "", { ...options, maxAge: 0 });
};
