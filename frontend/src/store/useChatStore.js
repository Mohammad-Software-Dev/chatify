import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

const MESSAGE_PAGE_SIZE = 50;

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isLoadingMoreMessages: false,
  hasMoreMessages: true,
  unreadByUserId: {},
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,

  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) =>
    set((state) => ({
      selectedUser,
      unreadByUserId: selectedUser
        ? { ...state.unreadByUserId, [selectedUser._id]: 0 }
        : state.unreadByUserId,
      chats: selectedUser
        ? state.chats.map((chat) =>
            chat._id === selectedUser._id
              ? { ...chat, unreadCount: 0 }
              : chat
          )
        : state.chats,
    })),

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/contacts");
      set({ allContacts: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },
  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/chats");
      const sortedChats = [...res.data].sort(
        (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
      );
      const unreadByUserId = sortedChats.reduce((acc, chat) => {
        acc[chat._id] = chat.unreadCount || 0;
        return acc;
      }, {});
      set({ chats: sortedChats, unreadByUserId });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessagesByUserId: async (userId, options = {}) => {
    const { before, append = false, markRead = true } = options;
    if (append) {
      set({ isLoadingMoreMessages: true });
    } else {
      set({ isMessagesLoading: true });
    }
    try {
      const params = new URLSearchParams();
      params.set("limit", MESSAGE_PAGE_SIZE.toString());
      if (before) params.set("before", before);
      if (!markRead) params.set("markRead", "false");
      const res = await axiosInstance.get(
        `/messages/${userId}${params.toString() ? `?${params}` : ""}`
      );
      set((state) => ({
        messages: append ? [...res.data, ...state.messages] : res.data,
        hasMoreMessages: res.data.length === MESSAGE_PAGE_SIZE,
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      if (append) {
        set({ isLoadingMoreMessages: false });
      } else {
        set({ isMessagesLoading: false });
      }
    }
  },

  loadOlderMessages: async () => {
    const { selectedUser, messages, hasMoreMessages, isLoadingMoreMessages } =
      get();
    if (!selectedUser || !hasMoreMessages || isLoadingMoreMessages) return;

    const oldestMessage = messages[0];
    const before =
      oldestMessage?.createdAt ||
      oldestMessage?.sentAt ||
      oldestMessage?.updatedAt ||
      oldestMessage?.deliveredAt;
    if (!before) return;

    await get().getMessagesByUserId(selectedUser._id, {
      before,
      append: true,
      markRead: false,
    });
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();
    const { authUser } = useAuthStore.getState();

    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      status: "sent",
      isOptimistic: true, // flag to identify optimistic messages (optional)
    };
    // immidetaly update the ui by adding the message
    set((state) => ({ messages: [...state.messages, optimisticMessage] }));

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        messageData
      );
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? res.data : msg
        ),
      }));
      set((state) => {
        const updatedChats = state.chats.map((chat) =>
          chat._id === selectedUser._id
            ? {
                ...chat,
                lastMessageAt: res.data.createdAt,
                lastMessageText: res.data.text || "",
                lastMessageImage: res.data.image || "",
                lastMessageSenderId: res.data.senderId,
              }
            : chat
        );
        updatedChats.sort(
          (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
        );
        return { chats: updatedChats };
      });
    } catch (error) {
      // remove optimistic message on failure
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id !== tempId),
      }));
      toast.error(error.response?.data?.message || "Something went wrong");
    }
  },

  markMessagesAsRead: async (userId) => {
    if (!userId) return;
    try {
      await axiosInstance.put(`/messages/read/${userId}`);
      set((state) => ({
        unreadByUserId: { ...state.unreadByUserId, [userId]: 0 },
        chats: state.chats.map((chat) =>
          chat._id === userId ? { ...chat, unreadCount: 0 } : chat
        ),
      }));
    } catch (error) {
      console.log("Error marking messages as read:", error);
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.off("messageStatusUpdate");

    socket.on("newMessage", (newMessage) => {
      const selectedUserId = get().selectedUser?._id;
      const isSoundEnabled = get().isSoundEnabled;
      const isFromSelectedUser = newMessage.senderId === selectedUserId;

      if (isFromSelectedUser) {
        const currentMessages = get().messages;
        set({ messages: [...currentMessages, newMessage] });
        get().markMessagesAsRead(selectedUserId);
        set((state) => {
          const updatedChats = state.chats.map((chat) =>
            chat._id === newMessage.senderId
              ? {
                  ...chat,
                  lastMessageAt: newMessage.createdAt,
                  lastMessageText: newMessage.text || "",
                  lastMessageImage: newMessage.image || "",
                  lastMessageSenderId: newMessage.senderId,
                }
              : chat
          );
          updatedChats.sort(
            (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
          );
          return { chats: updatedChats };
        });
      } else {
        const existingChat = get().chats.find(
          (chat) => chat._id === newMessage.senderId
        );
        if (!existingChat) {
          get().getMyChatPartners();
        } else {
          set((state) => {
            const updatedChats = state.chats.map((chat) =>
              chat._id === newMessage.senderId
                ? {
                    ...chat,
                    lastMessageAt: newMessage.createdAt,
                    lastMessageText: newMessage.text || "",
                    lastMessageImage: newMessage.image || "",
                    lastMessageSenderId: newMessage.senderId,
                    unreadCount: (chat.unreadCount || 0) + 1,
                  }
                : chat
            );
            updatedChats.sort(
              (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
            );
            return {
              chats: updatedChats,
              unreadByUserId: {
                ...state.unreadByUserId,
                [newMessage.senderId]:
                  (state.unreadByUserId[newMessage.senderId] || 0) + 1,
              },
            };
          });
        }
      }

      if (isSoundEnabled) {
        const notificationSound = new Audio("/sounds/notification.mp3");

        notificationSound.currentTime = 0; // reset to start
        notificationSound
          .play()
          .catch((e) => console.log("Audio play failed:", e));
      }
    });

    socket.on("messageStatusUpdate", (payload) => {
      const { messageIds, status, readAt, deliveredAt } = payload;
      if (!Array.isArray(messageIds)) return;

      set((state) => ({
        messages: state.messages.map((msg) =>
          messageIds.includes(msg._id)
            ? {
                ...msg,
                status,
                readAt: readAt ?? msg.readAt,
                deliveredAt: deliveredAt ?? msg.deliveredAt,
              }
            : msg
        ),
      }));
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
    socket.off("messageStatusUpdate");
  },
}));
