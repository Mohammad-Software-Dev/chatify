import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

const MESSAGE_PAGE_SIZE = 20;
const QUEUE_STORAGE_KEY = "chatify.pendingQueue";
const MAX_RETRY_DELAY_MS = 30000;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_ATTEMPTS = 3;
const typingTimeouts = new Map();

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

const getMessageTimestamp = (msg) => {
  const time =
    msg?.createdAt ||
    msg?.sentAt ||
    msg?.updatedAt ||
    msg?.deliveredAt ||
    msg?.readAt;
  return time ? new Date(time).getTime() : 0;
};

const isValidObjectId = (value) =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

const isChatLastMessage = (chat, message) => {
  if (!chat?.lastMessageAt) return false;
  const chatTime = new Date(chat.lastMessageAt).getTime();
  const msgTime = getMessageTimestamp(message);
  if (chatTime !== msgTime) return false;
  return (
    String(chat.lastMessageSenderId || "") === String(message.senderId || "")
  );
};

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null,
  pendingScrollMessageId: null,
  isUsersLoading: false,
  isContactSearching: false,
  isMessagesLoading: false,
  isLoadingMoreMessages: false,
  hasMoreMessages: true,
  unreadByUserId: {},
  typingByUserId: {},
  searchResults: [],
  pinnedMessages: [],
  starredMessages: [],
  isSearching: false,
  searchError: null,
  isPinnedLoading: false,
  isStarredLoading: false,
  pendingQueue: loadPendingQueue(),
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,
  replyToMessage: null,

  toggleSound: () => {
    localStorage.setItem("isSoundEnabled", !get().isSoundEnabled);
    set({ isSoundEnabled: !get().isSoundEnabled });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setReplyToMessage: (message) => set({ replyToMessage: message }),
  clearReplyToMessage: () => set({ replyToMessage: null }),
  resetForLogout: () => {
    savePendingQueue([]);
    set((state) => ({
      allContacts: [],
      chats: [],
      messages: [],
      activeTab: "chats",
      selectedUser: null,
      isUsersLoading: false,
      isContactSearching: false,
      isMessagesLoading: false,
      isLoadingMoreMessages: false,
      hasMoreMessages: true,
      unreadByUserId: {},
      typingByUserId: {},
      searchResults: [],
      pinnedMessages: [],
      starredMessages: [],
      isSearching: false,
      searchError: null,
      isPinnedLoading: false,
      isStarredLoading: false,
      pendingQueue: [],
      replyToMessage: null,
      isSoundEnabled: state.isSoundEnabled,
    }));
  },
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
  setPendingScrollMessageId: (messageId) =>
    set({ pendingScrollMessageId: messageId }),
  clearPendingScrollMessageId: () => set({ pendingScrollMessageId: null }),

  getAllContacts: async (username) => {
    set({ isContactSearching: true });
    try {
      const query = username?.trim();
      if (!query) {
        set({ allContacts: [], isContactSearching: false });
        return;
      }
      const res = await axiosInstance.get(
        `/messages/contacts?username=${encodeURIComponent(query)}`
      );
      set({ allContacts: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isContactSearching: false });
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
      uploadProgress: null,
      localStatus: "sending",
      isOptimistic: true, // flag to identify optimistic messages (optional)
    };
    // immidetaly update the ui by adding the message
    set((state) => ({
      messages: sortMessages([...state.messages, optimisticMessage]),
    }));

    if (isOffline) {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? { ...msg, localStatus: "queued" } : msg
        ),
      }));
      get().enqueuePendingMessage({
        id: tempId,
        toUserId: selectedUser._id,
        payload: { ...messageData, clientMessageId: tempId },
        attempt: 0,
        nextRetryAt: Date.now(),
        status: "queued",
      });
      toast.error("You are offline. Message queued.");
      return;
    }

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        { ...messageData, clientMessageId: tempId }
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
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? { ...msg, localStatus: "queued" } : msg
        ),
      }));
      get().enqueuePendingMessage({
        id: tempId,
        toUserId: selectedUser._id,
        payload: { ...messageData, clientMessageId: tempId },
        attempt: 0,
        nextRetryAt: Date.now(),
        status: "queued",
      });
      toast.error(error.response?.data?.message || "Message queued");
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
    const readyEntry = pendingQueue.find(
      (item) => item.nextRetryAt <= now && item.status !== "failed"
    );
    if (!readyEntry) return;

    try {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === readyEntry.id ? { ...msg, localStatus: "sending" } : msg
        ),
      }));
      const res = await axiosInstance.post(
        `/messages/send/${readyEntry.toUserId}`,
        readyEntry.payload
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
      if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg._id === readyEntry.id
              ? { ...msg, localStatus: "failed" }
              : msg
          ),
        }));
        set((state) => {
          const queue = state.pendingQueue.map((item) =>
            item.id === readyEntry.id
              ? { ...item, status: "failed", attempt: nextAttempt }
              : item
          );
          savePendingQueue(queue);
          return { pendingQueue: queue };
        });
        return;
      }

      const delay = Math.min(
        BASE_RETRY_DELAY_MS * 2 ** nextAttempt,
        MAX_RETRY_DELAY_MS
      );
      const updatedEntry = {
        ...readyEntry,
        attempt: nextAttempt,
        nextRetryAt: Date.now() + delay,
        status: "queued",
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

  retryFailedMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id === messageId ? { ...msg, localStatus: "queued" } : msg
      ),
    }));
    set((state) => {
      const existing = state.pendingQueue.find((item) => item.id === messageId);
      if (!existing) return state;
      const updatedQueue = state.pendingQueue.map((item) =>
        item.id === messageId
          ? {
              ...item,
              status: "queued",
              attempt: 0,
              nextRetryAt: Date.now(),
            }
          : item
      );
      savePendingQueue(updatedQueue);
      return { pendingQueue: updatedQueue };
    });
    get().processPendingQueue();
  },

  retryAllFailedMessages: () => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.localStatus === "failed" ? { ...msg, localStatus: "queued" } : msg
      ),
    }));
    set((state) => {
      const updatedQueue = state.pendingQueue.map((item) =>
        item.status === "failed"
          ? {
              ...item,
              status: "queued",
              attempt: 0,
              nextRetryAt: Date.now(),
            }
          : item
      );
      savePendingQueue(updatedQueue);
      return { pendingQueue: updatedQueue };
    });
    get().processPendingQueue();
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

  searchMessages: async (userId, query) => {
    const trimmed = query?.trim();
    if (!userId || !trimmed) {
      set({ searchResults: [], isSearching: false, searchError: null });
      return;
    }
    set({ isSearching: true, searchError: null });
    try {
      const res = await axiosInstance.get(
        `/messages/search/${userId}?q=${encodeURIComponent(trimmed)}`
      );
      set({ searchResults: res.data || [], searchError: null });
    } catch (error) {
      const message =
        error.response?.data?.message || "Search failed";
      set({ searchError: message, searchResults: [] });
      toast.error(message);
    } finally {
      set({ isSearching: false });
    }
  },

  clearSearchResults: () =>
    set({ searchResults: [], isSearching: false, searchError: null }),

  loadPinnedMessages: async (userId) => {
    if (!userId) return;
    set({ isPinnedLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/pinned/${userId}`);
      set({ pinnedMessages: res.data || [] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load pinned");
    } finally {
      set({ isPinnedLoading: false });
    }
  },

  loadStarredMessages: async (userId) => {
    if (!userId) return;
    set({ isStarredLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/starred/${userId}`);
      set({ starredMessages: res.data || [] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load starred");
    } finally {
      set({ isStarredLoading: false });
    }
  },

  togglePin: async (messageId) => {
    if (!isValidObjectId(messageId)) {
      toast.error("Message is not sent yet.");
      return;
    }
    try {
      const res = await axiosInstance.post(`/messages/${messageId}/pin`);
      const updated = res.data;
      const authUser = useAuthStore.getState().authUser;
      const isPinnedForMe = updated.pinnedBy?.some(
        (id) => String(id) === String(authUser?._id)
      );
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(updated._id)
            ? { ...msg, pinnedBy: updated.pinnedBy || [] }
            : msg
        ),
        pinnedMessages: isPinnedForMe
          ? [
              updated,
              ...state.pinnedMessages.filter(
                (m) => String(m._id) !== String(updated._id)
              ),
            ]
          : state.pinnedMessages.filter(
              (m) => String(m._id) !== String(updated._id)
            ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Pin failed");
    }
  },

  toggleStar: async (messageId) => {
    if (!isValidObjectId(messageId)) {
      toast.error("Message is not sent yet.");
      return;
    }
    try {
      const res = await axiosInstance.post(`/messages/${messageId}/star`);
      const updated = res.data;
      const authUser = useAuthStore.getState().authUser;
      const isStarredForMe = updated.starredBy?.some(
        (id) => String(id) === String(authUser?._id)
      );
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(updated._id)
            ? { ...msg, starredBy: updated.starredBy || [] }
            : msg
        ),
        starredMessages: isStarredForMe
          ? [
              updated,
              ...state.starredMessages.filter(
                (m) => String(m._id) !== String(updated._id)
              ),
            ]
          : state.starredMessages.filter(
              (m) => String(m._id) !== String(updated._id)
            ),
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Star failed");
    }
  },

  editMessage: async (messageId, text) => {
    try {
      const res = await axiosInstance.put(`/messages/${messageId}`, { text });
      const updated = res.data;
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId
            ? {
                ...msg,
                text: updated.text,
                editedAt: updated.editedAt,
                updatedAt: updated.updatedAt,
              }
            : msg
        ),
        pinnedMessages: state.pinnedMessages.map((msg) =>
          String(msg._id) === String(messageId)
            ? { ...msg, text: updated.text, editedAt: updated.editedAt }
            : msg
        ),
        starredMessages: state.starredMessages.map((msg) =>
          String(msg._id) === String(messageId)
            ? { ...msg, text: updated.text, editedAt: updated.editedAt }
            : msg
        ),
        chats: state.chats.map((chat) =>
          isChatLastMessage(chat, updated)
            ? {
                ...chat,
                lastMessageText: updated.text || "",
              }
            : chat
        ),
      }));
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to edit message");
      return false;
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const res = await axiosInstance.delete(`/messages/${messageId}`);
      const updated = res.data;
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId
            ? {
                ...msg,
                text: "",
                image: "",
                images: [],
                linkPreview: null,
                deletedAt: updated.deletedAt,
                deletedBy: updated.deletedBy,
              }
            : msg
        ),
        pinnedMessages: state.pinnedMessages.filter(
          (msg) => String(msg._id) !== String(messageId)
        ),
        starredMessages: state.starredMessages.filter(
          (msg) => String(msg._id) !== String(messageId)
        ),
        chats: state.chats.map((chat) =>
          isChatLastMessage(chat, updated)
            ? {
                ...chat,
                lastMessageText: "Message deleted",
                lastMessageImage: "",
                lastMessageImages: [],
              }
            : chat
        ),
      }));
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete message");
      return false;
    }
  },

  fetchMessageById: async (messageId) => {
    try {
      const res = await axiosInstance.get(`/messages/item/${messageId}`);
      const message = res.data;
      if (!message?._id) return null;
      set((state) => {
        const exists = state.messages.some(
          (msg) => String(msg._id) === String(message._id)
        );
        if (exists) return state;
        return { messages: sortMessages([...state.messages, message]) };
      });
      return message;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load message");
      return null;
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("messageReactionUpdate");
    socket.off("messageUpdated");
    socket.off("messageDeleted");
    socket.off("messagePinned");
    socket.off("messageStarred");

    socket.on("newMessage", (newMessage) => {
      const selectedUserId = get().selectedUser?._id;
      const isSoundEnabled = get().isSoundEnabled;
      const isFromSelectedUser = newMessage.senderId === selectedUserId;

      if (isFromSelectedUser) {
        const currentMessages = get().messages;
        set({ messages: sortMessages([...currentMessages, newMessage]) });
        get().markMessagesAsRead(selectedUserId);
        if (typingTimeouts.has(newMessage.senderId)) {
          clearTimeout(typingTimeouts.get(newMessage.senderId));
          typingTimeouts.delete(newMessage.senderId);
        }
        set((state) => {
          if (!state.typingByUserId[newMessage.senderId]) return state;
          return {
            typingByUserId: {
              ...state.typingByUserId,
              [newMessage.senderId]: false,
            },
          };
        });
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

    socket.on("messageReactionUpdate", ({ messageId, reactions }) => {
      if (!messageId) return;
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(messageId) ? { ...msg, reactions } : msg
        ),
      }));
    });

    socket.on("messageUpdated", (updatedMessage) => {
      if (!updatedMessage?._id) return;
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? {
                ...msg,
                text: updatedMessage.text,
                editedAt: updatedMessage.editedAt,
                updatedAt: updatedMessage.updatedAt,
              }
            : msg
        ),
        pinnedMessages: state.pinnedMessages.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? {
                ...msg,
                text: updatedMessage.text,
                editedAt: updatedMessage.editedAt,
              }
            : msg
        ),
        starredMessages: state.starredMessages.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? {
                ...msg,
                text: updatedMessage.text,
                editedAt: updatedMessage.editedAt,
              }
            : msg
        ),
        chats: state.chats.map((chat) =>
          isChatLastMessage(chat, updatedMessage)
            ? {
                ...chat,
                lastMessageText: updatedMessage.text || "",
              }
            : chat
        ),
      }));
    });

    socket.on("messageDeleted", (deletedMessage) => {
      if (!deletedMessage?._id) return;
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(deletedMessage._id)
            ? {
                ...msg,
                text: "",
                image: "",
                images: [],
                linkPreview: null,
                deletedAt: deletedMessage.deletedAt,
                deletedBy: deletedMessage.deletedBy,
              }
            : msg
        ),
        pinnedMessages: state.pinnedMessages.filter(
          (msg) => String(msg._id) !== String(deletedMessage._id)
        ),
        starredMessages: state.starredMessages.filter(
          (msg) => String(msg._id) !== String(deletedMessage._id)
        ),
        chats: state.chats.map((chat) =>
          isChatLastMessage(chat, deletedMessage)
            ? {
                ...chat,
                lastMessageText: "Message deleted",
                lastMessageImage: "",
                lastMessageImages: [],
              }
            : chat
        ),
      }));
    });

    socket.on("messagePinned", (updatedMessage) => {
      if (!updatedMessage?._id) return;
      const authUser = useAuthStore.getState().authUser;
      const isPinnedForMe = updatedMessage.pinnedBy?.some(
        (id) => String(id) === String(authUser?._id)
      );
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? { ...msg, pinnedBy: updatedMessage.pinnedBy || [] }
            : msg
        ),
        pinnedMessages: isPinnedForMe
          ? [
              updatedMessage,
              ...state.pinnedMessages.filter(
                (m) => String(m._id) !== String(updatedMessage._id)
              ),
            ]
          : state.pinnedMessages.filter(
              (m) => String(m._id) !== String(updatedMessage._id)
            ),
      }));
    });

    socket.on("messageStarred", (updatedMessage) => {
      if (!updatedMessage?._id) return;
      const authUser = useAuthStore.getState().authUser;
      const isStarredForMe = updatedMessage.starredBy?.some(
        (id) => String(id) === String(authUser?._id)
      );
      set((state) => ({
        messages: state.messages.map((msg) =>
          String(msg._id) === String(updatedMessage._id)
            ? { ...msg, starredBy: updatedMessage.starredBy || [] }
            : msg
        ),
        starredMessages: isStarredForMe
          ? [
              updatedMessage,
              ...state.starredMessages.filter(
                (m) => String(m._id) !== String(updatedMessage._id)
              ),
            ]
          : state.starredMessages.filter(
              (m) => String(m._id) !== String(updatedMessage._id)
            ),
      }));
    });

    socket.on("typing:start", ({ fromUserId }) => {
      if (!fromUserId) return;
      set((state) => {
        if (state.typingByUserId[fromUserId]) return state;
        return {
          typingByUserId: { ...state.typingByUserId, [fromUserId]: true },
        };
      });
      if (typingTimeouts.has(fromUserId)) {
        clearTimeout(typingTimeouts.get(fromUserId));
      }
      const timeoutId = setTimeout(() => {
        set((state) => {
          if (!state.typingByUserId[fromUserId]) return state;
          return {
            typingByUserId: { ...state.typingByUserId, [fromUserId]: false },
          };
        });
        typingTimeouts.delete(fromUserId);
      }, 3000);
      typingTimeouts.set(fromUserId, timeoutId);
    });

    socket.on("typing:stop", ({ fromUserId }) => {
      if (!fromUserId) return;
      if (typingTimeouts.has(fromUserId)) {
        clearTimeout(typingTimeouts.get(fromUserId));
        typingTimeouts.delete(fromUserId);
      }
      const timeoutId = setTimeout(() => {
        set((state) => {
          if (!state.typingByUserId[fromUserId]) return state;
          return {
            typingByUserId: { ...state.typingByUserId, [fromUserId]: false },
          };
        });
        typingTimeouts.delete(fromUserId);
      }, 1200);
      typingTimeouts.set(fromUserId, timeoutId);
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("typing:start");
    socket.off("typing:stop");
    socket.off("messageReactionUpdate");
    socket.off("messageUpdated");
    socket.off("messageDeleted");
    socket.off("messagePinned");
    socket.off("messageStarred");
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
