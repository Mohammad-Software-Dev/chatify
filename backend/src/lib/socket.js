import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";

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
  const existingSockets = userSocketMap.get(userId) || new Set();
  existingSockets.add(socket.id);
  userSocketMap.set(userId, existingSockets);

  // io.emit() is used to send events to all connected clients
  io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));

  // with socket.on we listen for events from clients
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
    const sockets = userSocketMap.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSocketMap.delete(userId);
      }
    }
    io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
  });
});

export { io, app, server };
