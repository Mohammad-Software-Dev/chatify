import { Server } from "socket.io";
import http from "http";
import express from "express";
import crypto from "crypto";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import User from "../models/User.js";
import logger from "./logger.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [ENV.CLIENT_URL],
    credentials: true,
  },
});

const buildEnvelope = (type, payload, meta = {}) => ({
  id: crypto.randomUUID(),
  type,
  ts: new Date().toISOString(),
  v: 1,
  ...meta,
  payload,
});

export const emitEnvelopeToAll = (type, payload, meta) => {
  io.emit("socket:event", buildEnvelope(type, payload, meta));
};

export const emitEnvelopeToSocketIds = (socketIds, type, payload, meta) => {
  if (!socketIds || socketIds.length === 0) return;
  const envelope = buildEnvelope(type, payload, meta);
  socketIds.forEach((socketId) => {
    io.to(socketId).emit("socket:event", envelope);
  });
};

// apply authentication middleware to all socket connections
io.use(socketAuthMiddleware);

// we will use this function to check if the user is online or not
export function getReceiverSocketIds(userId) {
  return Array.from(userSocketMap.get(userId) || []);
}

// this is for storig online users
const userSocketMap = new Map(); // {userId:Set<socketId>}

io.on("connection", (socket) => {
  logger.debug("A user connected");

  const userId = socket.userId;
  const now = new Date();
  const existingSockets = userSocketMap.get(userId) || new Set();
  existingSockets.add(socket.id);
  userSocketMap.set(userId, existingSockets);

  User.findByIdAndUpdate(userId, { lastActiveAt: now }).catch((error) => {
    logger.warn("Error updating lastActiveAt:", error.message);
  });
  emitEnvelopeToAll("presence:update", {
    userId,
    isOnline: true,
    lastActiveAt: now.toISOString(),
  });
  emitEnvelopeToAll("presence:list", {
    userIds: Array.from(userSocketMap.keys()),
  });

  // with socket.on we listen for events from clients
  socket.on("presence:ping", () => {
    const pingTime = new Date();
    User.findByIdAndUpdate(userId, { lastActiveAt: pingTime }).catch(
      (error) => {
        logger.warn("Error updating lastActiveAt:", error.message);
      }
    );
    emitEnvelopeToAll("presence:update", {
      userId,
      isOnline: true,
      lastActiveAt: pingTime.toISOString(),
    });
  });
  socket.on("typing:start", ({ toUserId }) => {
    if (!toUserId) return;
    const receiverSocketIds = getReceiverSocketIds(toUserId);
    emitEnvelopeToSocketIds(receiverSocketIds, "typing:start", {
      fromUserId: userId,
    });
  });

  socket.on("typing:stop", ({ toUserId }) => {
    if (!toUserId) return;
    const receiverSocketIds = getReceiverSocketIds(toUserId);
    emitEnvelopeToSocketIds(receiverSocketIds, "typing:stop", {
      fromUserId: userId,
    });
  });

  socket.on("message:queued", ({ clientMessageId, toUserId }) => {
    if (!clientMessageId) return;
    const senderSocketIds = getReceiverSocketIds(userId);
    emitEnvelopeToSocketIds(senderSocketIds, "message:queued", {
      clientMessageId,
      toUserId,
    });
  });

  socket.on("message:retrying", ({ clientMessageId, attempt }) => {
    if (!clientMessageId) return;
    const senderSocketIds = getReceiverSocketIds(userId);
    emitEnvelopeToSocketIds(senderSocketIds, "message:retrying", {
      clientMessageId,
      attempt,
    });
  });

  socket.on("message:failed", ({ clientMessageId, reason }) => {
    if (!clientMessageId) return;
    const senderSocketIds = getReceiverSocketIds(userId);
    emitEnvelopeToSocketIds(senderSocketIds, "message:failed", {
      clientMessageId,
      reason,
    });
  });

  socket.on("disconnect", () => {
    logger.debug("A user disconnected");
    const disconnectTime = new Date();
    const sockets = userSocketMap.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSocketMap.delete(userId);
      }
    }
    emitEnvelopeToAll("presence:list", {
      userIds: Array.from(userSocketMap.keys()),
    });
    User.findByIdAndUpdate(userId, { lastSeenAt: disconnectTime }).catch(
      (error) => {
        logger.warn("Error updating lastSeenAt:", error.message);
      }
    );
    emitEnvelopeToAll("presence:update", {
      userId,
      isOnline: false,
      lastSeenAt: disconnectTime.toISOString(),
    });
  });
});

export { io, app, server };
