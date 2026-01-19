import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

const MESSAGE_PAGE_SIZE = 20;
const QUEUE_STORAGE_KEY = "chatify.pendingQueue";
const MAX_RETRY_DELAY_MS = 30000;
const BASE_RETRY_DELAY_MS = 1000;

const loadPendingQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePendingQueue = (queue) => {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
};

const getMessageSortKey = (msg) => {
  const time =
    msg?.createdAt ||
    msg?.sentAt ||
    msg?.updatedAt ||
    msg?.deliveredAt ||
    msg?.readAt;
  const timestamp = time ? new Date(time).getTime() : 0;
  return {
    timestamp,
    id: msg?._id || msg?.clientMessageId || "",
  };
};

const sortMessages = (messages) =>
  [...messages].sort((a, b) => {
    const aKey = getMessageSortKey(a);
    const bKey = getMessageSortKey(b);
    if (aKey.timestamp !== bKey.timestamp) {
      return aKey.timestamp - bKey.timestamp;
    }
    return String(aKey.id).localeCompare(String(bKey.id));
  });

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
  typingByUserId: {},
  pendingQueue: loadPendingQueue(),
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,
  replyToMessage: null,
  editingMessage: null,

  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setReplyToMessage: (message) => set({ replyToMessage: message }),
  clearReplyToMessage: () => set({ replyToMessage: null }),
  setEditingMessage: (message) => set({ editingMessage: message }),
  clearEditingMessage: () => set({ editingMessage: null }),
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
        messages: sortMessages(
          append ? [...res.data, ...state.messages] : res.data
        ),
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
    const isOffline =
      typeof navigator !== "undefined" ? !navigator.onLine : false;

    const tempId = `temp-${Date.now()}`;
    const images = Array.isArray(messageData.images)
      ? messageData.images
      : messageData.image
      ? [messageData.image]
      : [];

    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: images[0],
      images,
      replyToMessageId: messageData.replyToMessageId,
      replyPreview: messageData.replyPreview,
      reactions: [],
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      status: "sent",
      clientMessageId: tempId,
      uploadProgress: images.length > 0 ? 0 : null,
      isOptimistic: true, // flag to identify optimistic messages (optional)
    };
    // immidetaly update the ui by adding the message
    set((state) => ({
      messages: sortMessages([...state.messages, optimisticMessage]),
    }));

    if (isOffline) {
      get().enqueuePendingMessage({
        id: tempId,
        toUserId: selectedUser._id,
        payload: { ...messageData, clientMessageId: tempId },
        attempt: 0,
        nextRetryAt: Date.now(),
      });
      toast.error("You are offline. Message queued.");
      return;
    }

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        { ...messageData, clientMessageId: tempId },
        {
          onUploadProgress: (event) => {
            if (!event.total) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg._id === tempId
                  ? { ...msg, uploadProgress: percent }
                  : msg
              ),
            }));
          },
        }
      );
      set((state) => ({
        messages: sortMessages(
          state.messages.map((msg) => (msg._id === tempId ? res.data : msg))
        ),
      }));
      get().clearReplyToMessage();
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
      get().enqueuePendingMessage({
        id: tempId,
        toUserId: selectedUser._id,
        payload: { ...messageData, clientMessageId: tempId },
        attempt: 0,
        nextRetryAt: Date.now(),
      });
      toast.error(error.response?.data?.message || "Message queued");
    }
  },

  updateMessage: async (messageId, text) => {
    try {
      const res = await axiosInstance.patch(`/messages/${messageId}`, { text });
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId ? res.data : msg
        ),
      }));
      get().clearEditingMessage();
    } catch (error) {
      toast.error(error.response?.data?.message || "Update failed");
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await axiosInstance.delete(`/messages/${messageId}`);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId
            ? {
                ...msg,
                deletedAt: new Date().toISOString(),
                text: "",
                image: "",
                images: [],
                linkPreview: null,
              }
            : msg
        ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  },

  addReaction: async (messageId, emoji) => {
    try {
      const res = await axiosInstance.post(`/messages/${messageId}/reactions`, {
        emoji,
      });
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId
            ? { ...msg, reactions: res.data.reactions }
            : msg
        ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Reaction failed");
    }
  },

  enqueuePendingMessage: (entry) => {
    set((state) => {
      const queue = [...state.pendingQueue, entry];
      savePendingQueue(queue);
      return { pendingQueue: queue };
    });
    get().processPendingQueue();
  },

  processPendingQueue: async () => {
    const { pendingQueue } = get();
    if (pendingQueue.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const now = Date.now();
    const readyEntry = pendingQueue.find((item) => item.nextRetryAt <= now);
    if (!readyEntry) return;

    try {
      const res = await axiosInstance.post(
        `/messages/send/${readyEntry.toUserId}`,
        readyEntry.payload,
        {
          onUploadProgress: (event) => {
            if (!event.total) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg._id === readyEntry.id
                  ? { ...msg, uploadProgress: percent }
                  : msg
              ),
            }));
          },
        }
      );

      set((state) => ({
        messages: sortMessages(
          state.messages.map((msg) =>
            msg._id === readyEntry.id ? res.data : msg
          )
        ),
      }));

      set((state) => {
        const updatedChats = state.chats.map((chat) =>
          chat._id === readyEntry.toUserId
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

      set((state) => {
        const queue = state.pendingQueue.filter(
          (item) => item.id !== readyEntry.id
        );
        savePendingQueue(queue);
        return { pendingQueue: queue };
      });
    } catch (error) {
      const nextAttempt = readyEntry.attempt + 1;
      const delay = Math.min(
        BASE_RETRY_DELAY_MS * 2 ** nextAttempt,
        MAX_RETRY_DELAY_MS
      );
      const updatedEntry = {
        ...readyEntry,
        attempt: nextAttempt,
        nextRetryAt: Date.now() + delay,
      };

      set((state) => {
        const queue = state.pendingQueue.map((item) =>
          item.id === updatedEntry.id ? updatedEntry : item
        );
        savePendingQueue(queue);
        return { pendingQueue: queue };
      });
    } finally {
      setTimeout(() => {
        get().processPendingQueue();
      }, 500);
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
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("messageUpdated");
    socket.off("messageDeleted");
    socket.off("messageReactionUpdate");

    socket.on("newMessage", (newMessage) => {
      const selectedUserId = get().selectedUser?._id;
      const isSoundEnabled = get().isSoundEnabled;
      const isFromSelectedUser = newMessage.senderId === selectedUserId;

      if (isFromSelectedUser) {
        const currentMessages = get().messages;
        set({ messages: sortMessages([...currentMessages, newMessage]) });
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

    socket.on("messageUpdated", (updatedMessage) => {
      if (!updatedMessage?._id) return;
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(updatedMessage._id) ? updatedMessage : msg
        ),
      }));
    });

    socket.on("messageDeleted", ({ messageId, deletedAt, deletedBy }) => {
      if (!messageId) return;
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(messageId)
            ? {
                ...msg,
                deletedAt: deletedAt || new Date().toISOString(),
                deletedBy,
                text: "",
                image: "",
                images: [],
                linkPreview: null,
              }
            : msg
        ),
      }));
    });

    socket.on("messageReactionUpdate", ({ messageId, reactions }) => {
      if (!messageId) return;
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(messageId) ? { ...msg, reactions } : msg
        ),
      }));
    });

    socket.on("typing:start", ({ fromUserId }) => {
      if (!fromUserId) return;
      set((state) => ({
        typingByUserId: { ...state.typingByUserId, [fromUserId]: true },
      }));
      setTimeout(() => {
        set((state) => ({
          typingByUserId: { ...state.typingByUserId, [fromUserId]: false },
        }));
      }, 3000);
    });

    socket.on("typing:stop", ({ fromUserId }) => {
      if (!fromUserId) return;
      set((state) => ({
        typingByUserId: { ...state.typingByUserId, [fromUserId]: false },
      }));
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("messageUpdated");
    socket.off("messageDeleted");
    socket.off("messageReactionUpdate");
  },

  emitTypingStart: (toUserId) => {
    const socket = useAuthStore.getState().socket;
    if (!socket || !toUserId) return;
    socket.emit("typing:start", { toUserId });
  },

  emitTypingStop: (toUserId) => {
    const socket = useAuthStore.getState().socket;
    if (!socket || !toUserId) return;
    socket.emit("typing:stop", { toUserId });
  },
}));
