import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const resetChatStore = async () => {
  try {
    const { useChatStore } = await import("./useChatStore");
    useChatStore.getState().resetForLogout();
  } catch (error) {
    console.log("Error resetting chat state:", error);
  }
};

const BASE_URL =
  import.meta.env.MODE === "development" ? "http://localhost:3000" : "/";

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
      await resetChatStore();
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
      await resetChatStore();
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

    // listen for online users event
    socket.on("getOnlineUsers", (userIds) => {
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
    });

    socket.on(
      "presence:update",
      ({ userId, isOnline, lastActiveAt, lastSeenAt }) => {
      if (!userId) return;
      set((state) => ({
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
          },
        },
      }));
    }
    );
  },

  disconnectSocket: () => {
    if (get().socket?.connected) get().socket.disconnect();
  },
}));
