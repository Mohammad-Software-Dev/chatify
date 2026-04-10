import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { ENV } from "../lib/env.js";
import logger from "../lib/logger.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (ENV.NODE_ENV === "production" && origin && origin !== ENV.CLIENT_URL) {
      logger.debug("Socket connection rejected: invalid origin");
      return next(new Error("Unauthorized - Invalid Origin"));
    }

    // extract token from http-only cookies
    const token = socket.handshake.headers.cookie
      ?.split("; ")
      .find((row) => row.startsWith("jwt="))
      ?.split("=")[1];

    if (!token) {
      logger.debug("Socket connection rejected: no token provided");
      return next(new Error("Unauthorized - No Token Provided"));
    }

    // verify the token
    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    if (!decoded) {
      logger.debug("Socket connection rejected: invalid token");
      return next(new Error("Unauthorized - Invalid Token"));
    }

    // find the user fromdb
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      logger.debug("Socket connection rejected: user not found");
      return next(new Error("User not found"));
    }

    // attach user info to socket
    socket.user = user;
    socket.userId = user._id.toString();

    logger.debug("Socket authenticated");

    next();
  } catch (error) {
    logger.debug("Socket authentication failed:", error.message);
    next(new Error("Unauthorized - Authentication failed"));
  }
};
