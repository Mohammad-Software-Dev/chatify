import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { resetRegisteredStores } from "./resetRegistry";

const resetChatStore = () => resetRegisteredStores();

const getSocketBaseURL = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, "");
  }
  return import.meta.env.MODE === "development" ? "http://localhost:3000" : "/";
};

const BASE_URL = getSocketBaseURL();

const SUPPORTED_ENVELOPE_VERSIONS = new Set([1]);
const CHAT_EVENT_TYPES = new Set([
  "message:new",
  "message:status",
  "message:reaction",
  "message:updated",
  "message:deleted",
  "message:pinned",
  "message:starred",
  "message:queued",
  "message:retrying",
  "message:failed",
  "typing:start",
  "typing:stop",
]);
const seenPresenceEventIds = new Set();
const MAX_SEEN_PRESENCE = 1000;
const markPresenceSeen = (id) => {
  if (!id) return false;
  if (seenPresenceEventIds.has(id)) return false;
  seenPresenceEventIds.add(id);
  if (seenPresenceEventIds.size > MAX_SEEN_PRESENCE) {
    const [first] = seenPresenceEventIds;
    seenPresenceEventIds.delete(first);
  }
  return true;
};

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],
  lastSeenByUserId: {},
  presenceByUserId: {},

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      console.log("Error in authCheck:", error);
      set({ authUser: null });
      resetChatStore();
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });

      toast.success("Account created successfully!");
      get().connectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });

      toast.success("Logged in successfully");

      get().connectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
      resetChatStore();
    } catch (error) {
      toast.error("Error logging out");
      console.log("Logout error:", error);
    }
  },

  updateProfile: async (data) => {
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("Error in update profile:", error);
      toast.error(error.response.data.message);
    }
  },

  updateUsername: async (username) => {
    try {
      const res = await axiosInstance.put("/auth/update-username", {
        username,
      });
      set({ authUser: res.data });
      toast.success("Username updated successfully");
      return true;
    } catch (error) {
      console.log("Error in update username:", error);
      toast.error(error.response?.data?.message || "Username update failed");
      return false;
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return;

    const socket = io(BASE_URL, {
      withCredentials: true, // this ensures cookies are sent with the connection
    });

    socket.connect();

    set({ socket });

    socket.on("socket:event", (event) => {
      if (!event?.type) return;
      const version = event.v ?? 1;
      if (!SUPPORTED_ENVELOPE_VERSIONS.has(version)) {
        if (import.meta.env.DEV) {
          console.warn("Unsupported socket envelope version", version, event);
        }
        return;
      }
      if (!markPresenceSeen(event.id)) return;
      if (event.type === "presence:list") {
        const userIds = event.payload?.userIds || [];
        set((state) => {
          const previousOnlineUsers = new Set(state.onlineUsers);
          const currentOnlineUsers = new Set(userIds);
          const now = new Date().toISOString();
          const lastSeenByUserId = { ...state.lastSeenByUserId };
          const presenceByUserId = { ...state.presenceByUserId };

          previousOnlineUsers.forEach((userId) => {
            if (!currentOnlineUsers.has(userId)) {
              lastSeenByUserId[userId] = now;
              presenceByUserId[userId] = {
                ...(presenceByUserId[userId] || {}),
                isOnline: false,
                lastSeenAt: now,
              };
            }
          });

          userIds.forEach((userId) => {
            presenceByUserId[userId] = {
              ...(presenceByUserId[userId] || {}),
              isOnline: true,
            };
          });

          return { onlineUsers: userIds, lastSeenByUserId, presenceByUserId };
        });
        return;
      }
      if (event.type === "presence:update") {
        const { userId, isOnline, lastActiveAt, lastSeenAt } =
          event.payload || {};
        if (!userId) return;
        set((state) => {
          const previousTs = state.presenceByUserId[userId]?.lastEventTs;
          if (event.ts && previousTs && event.ts < previousTs) return state;
          return {
            presenceByUserId: {
              ...state.presenceByUserId,
              [userId]: {
                ...(state.presenceByUserId[userId] || {}),
                isOnline:
                  typeof isOnline === "boolean"
                    ? isOnline
                    : state.presenceByUserId[userId]?.isOnline,
                lastActiveAt:
                  lastActiveAt || state.presenceByUserId[userId]?.lastActiveAt,
                lastSeenAt:
                  lastSeenAt || state.presenceByUserId[userId]?.lastSeenAt,
                lastEventTs: event.ts || state.presenceByUserId[userId]?.lastEventTs,
              },
            },
          };
        });
        return;
      }
      if (CHAT_EVENT_TYPES.has(event.type)) return;
      if (import.meta.env.DEV) {
        console.warn("Unhandled socket event", event.type, event);
      }
    });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.off("socket:event");
      if (socket.connected) socket.disconnect();
    }
    set({
      socket: null,
      onlineUsers: [],
      lastSeenByUserId: {},
      presenceByUserId: {},
    });
  },
}));
