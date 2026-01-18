import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import User from "../models/User.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [ENV.CLIENT_URL],
    credentials: true,
  },
});

// apply authentication middleware to all socket connections
io.use(socketAuthMiddleware);

// we will use this function to check if the user is online or not
export function getReceiverSocketIds(userId) {
  return Array.from(userSocketMap.get(userId) || []);
}

// this is for storig online users
const userSocketMap = new Map(); // {userId:Set<socketId>}

io.on("connection", (socket) => {
  console.log("A user connected", socket.user.fullName);

  const userId = socket.userId;
  const now = new Date();
  const existingSockets = userSocketMap.get(userId) || new Set();
  existingSockets.add(socket.id);
  userSocketMap.set(userId, existingSockets);

  User.findByIdAndUpdate(userId, { lastActiveAt: now }).catch((error) => {
    console.log("Error updating lastActiveAt:", error.message);
  });
  io.emit("presence:update", {
    userId,
    isOnline: true,
    lastActiveAt: now.toISOString(),
  });

  // io.emit() is used to send events to all connected clients
  io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));

  // with socket.on we listen for events from clients
  socket.on("presence:ping", () => {
    const pingTime = new Date();
    User.findByIdAndUpdate(userId, { lastActiveAt: pingTime }).catch(
      (error) => {
        console.log("Error updating lastActiveAt:", error.message);
      }
    );
    io.emit("presence:update", {
      userId,
      isOnline: true,
      lastActiveAt: pingTime.toISOString(),
    });
  });
  socket.on("typing:start", ({ toUserId }) => {
    if (!toUserId) return;
    const receiverSocketIds = getReceiverSocketIds(toUserId);
    receiverSocketIds.forEach((socketId) => {
      io.to(socketId).emit("typing:start", { fromUserId: userId });
    });
  });

  socket.on("typing:stop", ({ toUserId }) => {
    if (!toUserId) return;
    const receiverSocketIds = getReceiverSocketIds(toUserId);
    receiverSocketIds.forEach((socketId) => {
      io.to(socketId).emit("typing:stop", { fromUserId: userId });
    });
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.user.fullName);
    const disconnectTime = new Date();
    const sockets = userSocketMap.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSocketMap.delete(userId);
      }
    }
    io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
    User.findByIdAndUpdate(userId, { lastSeenAt: disconnectTime }).catch(
      (error) => {
        console.log("Error updating lastSeenAt:", error.message);
      }
    );
    io.emit("presence:update", {
      userId,
      isOnline: false,
      lastSeenAt: disconnectTime.toISOString(),
    });
  });
});

export { io, app, server };
