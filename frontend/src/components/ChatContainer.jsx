import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VariableSizeList as List } from "react-window";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  PinIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    messages,
    isMessagesLoading,
    loadOlderMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    isTyping,
    setReplyToMessage,
    addReaction,
    editMessage,
    deleteMessage,
    searchMessages,
    clearSearchResults,
    searchResults,
    isSearching,
    searchError,
    pinnedMessages,
    starredMessages,
    loadPinnedMessages,
    loadStarredMessages,
    togglePin,
    toggleStar,
    fetchMessageById,
    retryFailedMessage,
    pendingScrollMessageId,
    clearPendingScrollMessageId,
  } = useChatStore(
    useShallow((state) => ({
      selectedUser: state.selectedUser,
      getMessagesByUserId: state.getMessagesByUserId,
      messages: state.messages,
      isMessagesLoading: state.isMessagesLoading,
      loadOlderMessages: state.loadOlderMessages,
      isLoadingMoreMessages: state.isLoadingMoreMessages,
      hasMoreMessages: state.hasMoreMessages,
      isTyping: state.typingByUserId?.[state.selectedUser?._id] || false,
      setReplyToMessage: state.setReplyToMessage,
      addReaction: state.addReaction,
      editMessage: state.editMessage,
      deleteMessage: state.deleteMessage,
      searchMessages: state.searchMessages,
      clearSearchResults: state.clearSearchResults,
      searchResults: state.searchResults,
      isSearching: state.isSearching,
      searchError: state.searchError,
      pinnedMessages: state.pinnedMessages,
      starredMessages: state.starredMessages,
      loadPinnedMessages: state.loadPinnedMessages,
      loadStarredMessages: state.loadStarredMessages,
      togglePin: state.togglePin,
      toggleStar: state.toggleStar,
      fetchMessageById: state.fetchMessageById,
      retryFailedMessage: state.retryFailedMessage,
      pendingScrollMessageId: state.pendingScrollMessageId,
      clearPendingScrollMessageId: state.clearPendingScrollMessageId,
    }))
  );
  const { authUser } = useAuthStore(
    useShallow((state) => ({ authUser: state.authUser }))
  );
  const listRef = useRef(null);
  const listOuterRef = useRef(null);
  const listWrapperRef = useRef(null);
  const isPrependingRef = useRef(false);
  const hasInitialScrollRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const [listHeight, setListHeight] = useState(0);
  const [detailsMessageId, setDetailsMessageId] = useState(null);
  const longPressTimerRef = useRef(null);
  const [highlightMessageId, setHighlightMessageId] = useState(null);
  const messageIdToIndexRef = useRef(new Map());
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("all");
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [isInitialPositioned, setIsInitialPositioned] = useState(false);
  const sizeMapRef = useRef(new Map());

  const scrollToLatest = useCallback(() => {
    if (!listRef.current) return;
    if (messages.length === 0) return;
    const lastIndex = messages.length - 1 + (isTyping ? 1 : 0);
    listRef.current.scrollToItem(lastIndex, "end");
  }, [messages.length, isTyping]);

  const messageIdToIndex = useMemo(() => {
    const map = new Map();
    messages.forEach((msg, index) => {
      map.set(String(msg._id), index);
    });
    return map;
  }, [messages]);

  const getMessageTime = (msg) =>
    msg?.createdAt || msg?.sentAt || msg?.updatedAt || msg?.deliveredAt || null;

  const formatTime = (time) => {
    if (!time) return "—";
    return new Date(time).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    messageIdToIndexRef.current = messageIdToIndex;
  }, [messageIdToIndex]);

  useLayoutEffect(() => {
    if (!listWrapperRef.current) return;
    const update = () => {
      const nextHeight =
        listWrapperRef.current.clientHeight ||
        listWrapperRef.current.parentElement?.clientHeight ||
        0;
      setListHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    requestAnimationFrame(update);
    const resizeHandler = () => requestAnimationFrame(update);
    window.addEventListener("resize", resizeHandler);
    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", resizeHandler);
      };
    }
    const observer = new ResizeObserver(update);
    observer.observe(listWrapperRef.current);
    return () => {
      window.removeEventListener("resize", resizeHandler);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    sizeMapRef.current.clear();
    listRef.current?.resetAfterIndex(0, true);
  }, [messages.length, messages[0]?._id, isTyping]);

  const setRowSize = useCallback((index, size) => {
    if (!Number.isFinite(size)) return;
    const current = sizeMapRef.current.get(index);
    if (current === size) return;
    sizeMapRef.current.set(index, size);
    listRef.current?.resetAfterIndex(index);
  }, []);

  const getItemSize = useCallback(
    (index) => {
      if (isTyping && index === messages.length) {
        return 64;
      }
      return sizeMapRef.current.get(index) || 120;
    },
    [isTyping, messages.length]
  );

  useEffect(() => {
    getMessagesByUserId(selectedUser._id);
    hasInitialScrollRef.current = false;
    prevMessageCountRef.current = 0;
    isAtBottomRef.current = true;
    setSearchQuery("");
    setViewMode("all");
    setHasNewMessages(false);
    setIsInitialPositioned(false);
    clearSearchResults();
  }, [selectedUser, getMessagesByUserId, clearSearchResults]);

  useEffect(() => {
    if (!pendingScrollMessageId) return;
    const targetId = pendingScrollMessageId;
    clearPendingScrollMessageId();
    scrollToMessage(targetId);
  }, [pendingScrollMessageId, clearPendingScrollMessageId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      clearSearchResults();
      if (viewMode === "search") {
        setViewMode("all");
      }
      return;
    }
    const timer = setTimeout(() => {
      searchMessages(selectedUser._id, searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMessages, selectedUser._id, clearSearchResults, viewMode]);

  useEffect(() => {
    if (!editingMessageId) return;
    const message = messages.find((msg) => msg._id === editingMessageId);
    if (message && message.deletedAt) {
      setEditingMessageId(null);
      setEditingText("");
    }
  }, [editingMessageId, messages]);

  useLayoutEffect(() => {
    if (isPrependingRef.current) return;
    if (!listRef.current || hasInitialScrollRef.current) return;
    if (messages.length === 0) return;
    const run = () => scrollToLatest();
    run();
    requestAnimationFrame(run);
    setTimeout(run, 0);
    hasInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      setIsInitialPositioned(true);
    });
  }, [messages.length, listHeight, selectedUser?._id, scrollToLatest]);

  useEffect(() => {
    const outer = listOuterRef.current;
    if (!outer || isPrependingRef.current) return;
    const prevCount = prevMessageCountRef.current;
    const isNewMessage = messages.length > prevCount;

    if (isNewMessage && isAtBottomRef.current) {
      scrollToLatest();
      setHasNewMessages((prev) => (prev ? false : prev));
    } else if (isNewMessage && !isAtBottomRef.current) {
      setHasNewMessages((prev) => (prev ? prev : true));
    }

    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    const outer = listOuterRef.current;
    if (!outer || !listRef.current) return;
    if (isTyping && isAtBottomRef.current) {
      scrollToLatest();
    }
  }, [isTyping, messages.length, scrollToLatest]);

  const handleLoadOlderMessages = async () => {
    const outer = listOuterRef.current;
    if (!outer) return;

    const prevScrollHeight = outer.scrollHeight;
    const prevScrollTop = outer.scrollTop;
    isPrependingRef.current = true;

    await loadOlderMessages();

    requestAnimationFrame(() => {
      const updatedOuter = listOuterRef.current;
      if (!updatedOuter) return;
      const newScrollHeight = updatedOuter.scrollHeight;
      updatedOuter.scrollTop =
        newScrollHeight - prevScrollHeight + prevScrollTop;
      isPrependingRef.current = false;
    });
  };
  const handleScroll = ({ scrollOffset }) => {
    const outer = listOuterRef.current;
    if (!outer) return;
    const atBottom =
      outer.scrollHeight - scrollOffset - outer.clientHeight <= 40;
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom;
    }
    if (atBottom) {
      setHasNewMessages((prev) => (prev ? false : prev));
    }
    if (
      scrollOffset <= 40 &&
      !isLoadingMoreMessages &&
      hasMoreMessages
    ) {
      handleLoadOlderMessages();
    }
  };

  const scrollToBottom = () => {
    if (messages.length === 0) return;
    scrollToLatest();
    setHasNewMessages(false);
  };

  const handleBubbleClick = (msg) => {
    if (msg.senderId !== authUser._id) return;
    setDetailsMessageId((current) => (current === msg._id ? null : msg._id));
  };

  const focusMessageInput = () => {
    const input = document.getElementById("chat-message-input");
    if (input) {
      input.focus();
    }
  };

  const handleTouchStart = (msg) => {
    if (msg.senderId !== authUser._id) return;
    longPressTimerRef.current = setTimeout(() => {
      setDetailsMessageId(msg._id);
    }, 400);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const scrollToMessage = async (messageId) => {
    const index = messageIdToIndexRef.current.get(String(messageId));
    if (index === undefined) {
      const fetched = await fetchMessageById(messageId);
      if (!fetched) return;
      requestAnimationFrame(() => {
        const targetIndex = messageIdToIndexRef.current.get(
          String(messageId)
        );
        if (targetIndex === undefined) {
          toast.error("Message not loaded yet");
          return;
        }
        listRef.current?.scrollToItem(targetIndex, "center");
        setHighlightMessageId(messageId);
        setTimeout(() => {
          setHighlightMessageId((current) =>
            current === messageId ? null : current
          );
        }, 1200);
      });
      return;
    }
    listRef.current?.scrollToItem(index, "center");
    setHighlightMessageId(messageId);
    setTimeout(() => {
      setHighlightMessageId((current) =>
        current === messageId ? null : current
      );
    }, 1200);
  };

  const openPinnedView = () => {
    setViewMode((current) => (current === "pinned" ? "all" : "pinned"));
    loadPinnedMessages(selectedUser._id);
  };

  const openStarredView = () => {
    setViewMode((current) => (current === "starred" ? "all" : "starred"));
    loadStarredMessages(selectedUser._id);
  };

  const isPinnedByMe = (msg) =>
    Array.isArray(msg.pinnedBy) &&
    msg.pinnedBy.some((id) => String(id) === String(authUser._id));

  const isStarredByMe = (msg) =>
    Array.isArray(msg.starredBy) &&
    msg.starredBy.some((id) => String(id) === String(authUser._id));
  const canToggleMessage = (msg) =>
    typeof msg?._id === "string" && /^[a-f0-9]{24}$/i.test(msg._id);

  const renderLocalStatus = (msg) => {
    if (!msg.isOptimistic) return null;
    if (msg.localStatus === "sending") {
      return (
        <Loader2
          className="w-3.5 h-3.5 text-slate-200/70 animate-spin"
          title="Sending"
        />
      );
    }
    if (msg.localStatus === "queued") {
      return (
        <Clock
          className="w-3.5 h-3.5 status-warning"
          title="Queued"
        />
      );
    }
    if (msg.localStatus === "failed") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            retryFailedMessage(msg._id);
          }}
          className="status-danger hover:opacity-90"
          title="Failed to send. Tap to retry."
        >
          <AlertCircle className="w-3.5 h-3.5" />
        </button>
      );
    }
    return null;
  };

  const effectiveListHeight =
    listHeight ||
    listWrapperRef.current?.parentElement?.clientHeight ||
    320;

  const Row = memo(({ index, style }) => {
    const rowRef = useRef(null);
    const isTypingRow = isTyping && index === messages.length;
    const msg = isTypingRow ? null : messages[index];

    useLayoutEffect(() => {
      if (!rowRef.current || isTypingRow || !msg) return;
      const measure = () => {
        const height = rowRef.current.getBoundingClientRect().height;
        setRowSize(index, height + 16);
      };
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(rowRef.current);
      return () => observer.disconnect();
    }, [index, msg?._id, isTypingRow, setRowSize]);

    if (isTypingRow) {
      return (
        <div style={style} className="px-6 pb-4">
          <div
            className={`typing-bubble ${
              isTyping ? "typing-bubble--visible" : ""
            }`}
          >
            <div className="chat chat-start">
              <div className="chat-bubble message-bubble-in">
                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!msg) return null;
    const status = msg.status || "sent";
    const isDeleted = Boolean(msg.deletedAt);
    const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
    const reactionCounts = reactions.reduce((acc, reaction) => {
      if (!reaction?.emoji) return acc;
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {});
    const replyPreview = msg.replyPreview;
    const showUploadProgress =
      msg.isOptimistic &&
      msg.uploadProgress !== null &&
      msg.uploadProgress < 100;

    return (
      <div style={style} className="px-6 pb-4">
        <div
          ref={rowRef}
          className={`chat ${
            msg.senderId === authUser._id ? "chat-end" : "chat-start"
          }`}
        >
          <div
            className={`chat-bubble relative group ${
              msg.senderId === authUser._id
                ? "message-bubble-out"
                : "message-bubble-in"
            } ${highlightMessageId === msg._id ? "message-flash" : ""}`}
            onClick={() => handleBubbleClick(msg)}
            onTouchStart={() => handleTouchStart(msg)}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {!isDeleted && replyPreview && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToMessage(replyPreview._id);
                }}
                className="mb-2 w-full rounded-md border border-slate-700/50 bg-slate-900/30 px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-900/50 transition-colors"
              >
                <div className="font-medium text-slate-300">Reply</div>
                <div className="truncate">
                  {replyPreview.deletedAt
                    ? "Message deleted"
                    : replyPreview.text ||
                      (replyPreview.images?.length > 0 || replyPreview.image
                        ? "Image"
                        : "Message")}
                </div>
              </button>
            )}
            {isDeleted ? (
              <p className="italic text-slate-300">Message deleted</p>
            ) : (
              (() => {
                const images =
                  msg.images?.length > 0
                    ? msg.images
                    : msg.image
                    ? [msg.image]
                    : [];
                if (images.length === 0) return null;
                if (images.length === 1) {
                  return (
                    <div className="relative">
                      <img
                        src={images[0]}
                        alt="Shared"
                        className="rounded-lg h-48 object-cover"
                      />
                      {showUploadProgress && (
                        <div className="absolute inset-0 rounded-lg bg-slate-900/40 flex items-center justify-center">
                          <span className="text-xs text-slate-100 font-medium">
                            {msg.uploadProgress}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((img) => (
                      <div key={img} className="relative">
                        <img
                          src={img}
                          alt="Shared"
                          className="rounded-lg h-32 w-full object-cover"
                        />
                        {showUploadProgress && (
                          <div className="absolute inset-0 rounded-lg bg-slate-900/40 flex items-center justify-center">
                            <span className="text-xs text-slate-100 font-medium">
                              {msg.uploadProgress}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
            {!isDeleted && (
              <>
                {editingMessageId === msg._id ? (
                  <div
                    className="mt-2 space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full rounded-md bg-slate-900/40 border border-slate-700/60 px-2 py-1 text-slate-100 text-sm"
                    />
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={async () => {
                          const trimmed = editingText.trim();
                          if (!trimmed) {
                            toast.error("Message cannot be empty");
                            return;
                          }
                          const ok = await editMessage(msg._id, trimmed);
                          if (ok) {
                            setEditingMessageId(null);
                            setEditingText("");
                          }
                        }}
                        className="px-2 py-1 rounded-md accent-soft border hover:opacity-90"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditingText("");
                        }}
                        className="px-2 py-1 rounded-md bg-slate-800/60 text-slate-200 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : msg.text ? (
                  <p className="mt-2">{msg.text}</p>
                ) : null}
              </>
            )}
            {!isDeleted && msg.linkPreview && (
              <a
                href={msg.linkPreview.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block rounded-lg border border-slate-700/50 bg-slate-900/30 p-2 text-sm text-slate-200"
              >
                {msg.linkPreview.image && (
                  <img
                    src={msg.linkPreview.image}
                    alt={msg.linkPreview.title || "Preview"}
                    className="w-full h-32 object-cover rounded-md mb-2"
                  />
                )}
                <div className="font-medium">
                  {msg.linkPreview.title || msg.linkPreview.url}
                </div>
                {msg.linkPreview.description && (
                  <div className="text-xs text-slate-400">
                    {msg.linkPreview.description}
                  </div>
                )}
              </a>
            )}
            {msg.isOptimistic &&
              msg.uploadProgress !== null &&
              msg.uploadProgress < 100 && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full accent-bg"
                    style={{ width: `${msg.uploadProgress}%` }}
                  />
                </div>
              )}
            {!isDeleted && Object.keys(reactionCounts).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(reactionCounts).map(([emoji, count]) => (
                  <span
                    key={emoji}
                    className="text-xs bg-slate-900/40 border border-slate-700/60 rounded-full px-2 py-0.5"
                  >
                    {emoji} {count}
                  </span>
                ))}
              </div>
            )}
            <div className="text-xs mt-1 opacity-75 flex items-center gap-1">
              <span>
                {new Date(
                  getMessageTime(msg) || Date.now()
                ).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {renderLocalStatus(msg)}
              {!isDeleted && isPinnedByMe(msg) && (
                <PinIcon className="w-3.5 h-3.5 accent-text-strong" />
              )}
              {!isDeleted && isStarredByMe(msg) && (
                <StarIcon className="w-3.5 h-3.5 status-warning" />
              )}
              {!isDeleted && msg.editedAt && (
                <span className="text-[11px] text-slate-200/70">Edited</span>
              )}
              {!isDeleted && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 ml-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplyToMessage(msg);
                      focusMessageInput();
                    }}
                    className="text-slate-200/80 hover:text-white"
                  >
                    Reply
                  </button>
                  {msg.senderId === authUser._id && msg.text && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingMessageId(msg._id);
                        setEditingText(msg.text || "");
                      }}
                      className="text-slate-200/80 hover:text-white"
                    >
                      Edit
                    </button>
                  )}
                  {msg.senderId === authUser._id && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = window.confirm("Delete this message?");
                        if (!ok) return;
                        const deleted = await deleteMessage(msg._id);
                        if (deleted) {
                          setEditingMessageId(null);
                          setEditingText("");
                        }
                      }}
                      className="status-danger hover:opacity-90"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(msg._id);
                    }}
                    disabled={!canToggleMessage(msg)}
                    className={`transition-colors ${
                      isPinnedByMe(msg)
                        ? "accent-text-strong"
                        : "text-slate-200/70 hover:text-white"
                    } ${
                      !canToggleMessage(msg)
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    title={
                      !canToggleMessage(msg)
                        ? "Message not sent yet"
                        : isPinnedByMe(msg)
                        ? "Unpin"
                        : "Pin"
                    }
                  >
                    <PinIcon
                      className={`w-4 h-4 ${
                        isPinnedByMe(msg) ? "fill-current" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(msg._id);
                    }}
                    disabled={!canToggleMessage(msg)}
                    className={`transition-colors ${
                      isStarredByMe(msg)
                        ? "status-warning"
                        : "text-slate-200/70 hover:text-white"
                    } ${
                      !canToggleMessage(msg)
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    title={
                      !canToggleMessage(msg)
                        ? "Message not sent yet"
                        : isStarredByMe(msg)
                        ? "Unstar"
                        : "Star"
                    }
                  >
                    <StarIcon
                      className={`w-4 h-4 ${
                        isStarredByMe(msg) ? "fill-current" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addReaction(msg._id, "👍");
                    }}
                    className="text-slate-200/80 hover:text-white"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addReaction(msg._id, "❤️");
                    }}
                    className="text-slate-200/80 hover:text-white"
                  >
                    ❤️
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addReaction(msg._id, "😂");
                    }}
                    className="text-slate-200/80 hover:text-white"
                  >
                    😂
                  </button>
                </span>
              )}
              {msg.senderId === authUser._id && (
                <span
                  className="flex items-center"
                  title={
                    status === "read"
                      ? `Read ${new Date(
                          msg.readAt || getMessageTime(msg) || Date.now()
                        ).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : status === "delivered"
                      ? `Delivered ${new Date(
                          msg.deliveredAt || getMessageTime(msg) || Date.now()
                        ).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : `Sent ${new Date(
                          msg.sentAt || getMessageTime(msg) || Date.now()
                        ).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                  }
                >
                  {status === "sent" ? (
                    <Check className="w-4 h-4 text-slate-200 bg-transparent" />
                  ) : (
                    <CheckCheck
                      className={`w-4 h-4 ${
                        status === "read"
                          ? "status-success"
                          : "text-slate-400"
                      } bg-transparent`}
                    />
                  )}
                </span>
              )}
            </div>
            {!isDeleted &&
              msg.senderId === authUser._id &&
              detailsMessageId === msg._id && (
                <div className="mt-2 text-xs text-slate-200/80">
                  <div>Sent: {formatTime(msg.sentAt)}</div>
                  <div>Delivered: {formatTime(msg.deliveredAt)}</div>
                  <div>Read: {formatTime(msg.readAt)}</div>
                </div>
              )}
          </div>
        </div>
      </div>
    );
  });

  Row.displayName = "ChatMessageRow";

  return (
    <>
      <ChatHeader />
      <div className="border-b border-slate-700/50 bg-slate-900/40 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 size-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim()) {
                  setViewMode("search");
                }
              }}
              placeholder="Search messages"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg py-2 pl-9 pr-9 text-slate-200 placeholder-slate-500 text-sm"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setViewMode("all");
                  clearSearchResults();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openPinnedView}
            className={`px-3 py-2 rounded-lg text-sm border ${
              viewMode === "pinned"
                ? "accent-soft border"
                : "border-slate-700 text-slate-300 bg-slate-800/40"
            }`}
          >
            Pinned
          </button>
          <button
            type="button"
            onClick={openStarredView}
            className={`px-3 py-2 rounded-lg text-sm border ${
              viewMode === "starred"
                ? "accent-soft border"
                : "border-slate-700 text-slate-300 bg-slate-800/40"
            }`}
          >
            Starred
          </button>
        </div>
      </div>
      {viewMode !== "all" && (
        <div className="border-b border-slate-700/50 bg-slate-900/30 px-6 py-3">
          <div className="max-w-3xl mx-auto space-y-2 max-h-64 overflow-y-auto pr-1">
            {viewMode === "search" && isSearching && (
              <div className="text-xs text-slate-400">Searching...</div>
            )}
            {viewMode === "search" && searchError && (
              <div className="text-xs status-warning">{searchError}</div>
            )}
            {(() => {
              const results =
                viewMode === "search"
                  ? searchResults
                  : viewMode === "pinned"
                  ? pinnedMessages
                  : starredMessages;
              if (viewMode === "search" && searchError) {
                return null;
              }
              if (!results.length) {
                return (
                  <div className="text-xs text-slate-400">
                    No messages found.
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {results.map((msg) => (
                    <button
                      key={msg._id}
                      type="button"
                      onClick={() => scrollToMessage(msg._id)}
                      className="w-full text-left rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">
                          {msg.text ||
                            (msg.images?.length > 0 || msg.image
                              ? "Image"
                              : "Message")}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(
                            getMessageTime(msg) || Date.now()
                          ).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {messages.length > 0 && !isMessagesLoading ? (
          <div
            ref={listWrapperRef}
            className={`h-full pt-4 transition-opacity duration-150 ${
              isInitialPositioned ? "opacity-100" : "opacity-0"
            }`}
          >
            {isLoadingMoreMessages && (
              <div className="flex justify-center text-slate-400 text-sm py-2">
                Loading older messages...
              </div>
            )}
            {effectiveListHeight > 0 && (
              <div className="relative h-full">
                <List
                  ref={listRef}
                  outerRef={listOuterRef}
                  height={effectiveListHeight}
                  width="100%"
                  itemCount={messages.length + (isTyping ? 1 : 0)}
                  itemSize={getItemSize}
                  onScroll={handleScroll}
                  itemKey={(index) => {
                    if (isTyping && index === messages.length) {
                      return "typing-indicator";
                    }
                    return messages[index]?._id || index;
                  }}
                >
                  {Row}
                </List>
                {hasNewMessages && !isAtBottomRef.current ? (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <button
                      type="button"
                      onClick={scrollToBottom}
                      className="px-3 py-1.5 rounded-full text-xs font-medium accent-soft border shadow-lg hover:opacity-90"
                    >
                      New messages
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder
            name={selectedUser.fullName}
            username={selectedUser.username}
          />
        )}
      </div>

      <MessageInput />
    </>
  );
}

export default memo(ChatContainer);
