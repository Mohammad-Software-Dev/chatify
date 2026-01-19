import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import { Check, CheckCheck } from "lucide-react";

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    messages,
    isMessagesLoading,
    loadOlderMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    typingByUserId,
    setReplyToMessage,
    addReaction,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messagesContainerRef = useRef(null);
  const isPrependingRef = useRef(false);
  const hasInitialScrollRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const isTyping = typingByUserId[selectedUser._id];
  const [renderLimit, setRenderLimit] = useState(60);
  const [detailsMessageId, setDetailsMessageId] = useState(null);
  const longPressTimerRef = useRef(null);
  const [highlightMessageId, setHighlightMessageId] = useState(null);
  const messageRefs = useRef(new Map());

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
    getMessagesByUserId(selectedUser._id);
    setRenderLimit(60);
    hasInitialScrollRef.current = false;
  }, [selectedUser, getMessagesByUserId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (isPrependingRef.current) return;
    const container = messagesContainerRef.current;
    if (!container || hasInitialScrollRef.current) return;
    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
    setTimeout(scrollToBottom, 0);
    hasInitialScrollRef.current = true;
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || isPrependingRef.current) return;
    const prevCount = prevMessageCountRef.current;
    const isNewMessage = messages.length > prevCount;

    if (isNewMessage && isAtBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }

    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (isTyping && isAtBottomRef.current) {
      const scrollToBottom = () => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      };
      scrollToBottom();
      requestAnimationFrame(scrollToBottom);
      setTimeout(scrollToBottom, 200);
    }
  }, [isTyping]);

  const handleLoadOlderMessages = async () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;
    isPrependingRef.current = true;

    await loadOlderMessages();
    setRenderLimit((prev) => prev + 20);

    requestAnimationFrame(() => {
      const updatedContainer = messagesContainerRef.current;
      if (!updatedContainer) return;
      const newScrollHeight = updatedContainer.scrollHeight;
      updatedContainer.scrollTop =
        newScrollHeight - prevScrollHeight + prevScrollTop;
      isPrependingRef.current = false;
    });
  };
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      40;
    isAtBottomRef.current = atBottom;
    if (
      container.scrollTop <= 40 &&
      !isLoadingMoreMessages &&
      hasMoreMessages
    ) {
      handleLoadOlderMessages();
    }
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

  const scrollToMessage = (messageId) => {
    const node = messageRefs.current.get(messageId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightMessageId(messageId);
    setTimeout(() => {
      setHighlightMessageId((current) =>
        current === messageId ? null : current
      );
    }, 1200);
  };

  return (
    <>
      <ChatHeader />
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 px-6 overflow-y-auto py-8"
      >
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            {isLoadingMoreMessages && (
              <div className="flex justify-center text-slate-400 text-sm">
                Loading older messages...
              </div>
            )}
            {messages
              .slice(
                hasMoreMessages && messages.length > renderLimit
                  ? messages.length - renderLimit
                  : 0
              )
              .map((msg) => {
                const status = msg.status || "sent";
                const isDeleted = Boolean(msg.deletedAt);
                const reactions = Array.isArray(msg.reactions)
                  ? msg.reactions
                  : [];
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
                  <div
                    key={msg._id}
                    className={`chat ${
                      msg.senderId === authUser._id ? "chat-end" : "chat-start"
                    }`}
                    ref={(node) => {
                      if (node) {
                        messageRefs.current.set(msg._id, node);
                      } else {
                        messageRefs.current.delete(msg._id);
                      }
                    }}
                  >
                    <div
                      className={`chat-bubble relative group ${
                        msg.senderId === authUser._id
                          ? "bg-cyan-600 text-white"
                          : "bg-slate-800 text-slate-200"
                      } ${
                        highlightMessageId === msg._id ? "message-flash" : ""
                      }`}
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
                          <div className="font-medium text-slate-300">
                            Reply
                          </div>
                          <div className="truncate">
                            {replyPreview.deletedAt
                              ? "Message deleted"
                              : replyPreview.text ||
                                (replyPreview.images?.length > 0 ||
                                replyPreview.image
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
                      {!isDeleted && msg.text && (
                        <p className="mt-2">{msg.text}</p>
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
                              className="h-full bg-cyan-300"
                              style={{ width: `${msg.uploadProgress}%` }}
                            />
                          </div>
                        )}
                      {!isDeleted && Object.keys(reactionCounts).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(reactionCounts).map(
                            ([emoji, count]) => (
                              <span
                                key={emoji}
                                className="text-xs bg-slate-900/40 border border-slate-700/60 rounded-full px-2 py-0.5"
                              >
                                {emoji} {count}
                              </span>
                            )
                          )}
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
                                    msg.readAt ||
                                      getMessageTime(msg) ||
                                      Date.now()
                                  ).toLocaleTimeString(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : status === "delivered"
                                ? `Delivered ${new Date(
                                    msg.deliveredAt ||
                                      getMessageTime(msg) ||
                                      Date.now()
                                  ).toLocaleTimeString(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : `Sent ${new Date(
                                    msg.sentAt ||
                                      getMessageTime(msg) ||
                                      Date.now()
                                  ).toLocaleTimeString(undefined, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                            }
                          >
                            {status === "sent" ? (
                              <Check className="w-4 h-4 text-slate-200" />
                            ) : (
                              <CheckCheck
                                className={`w-4 h-4 ${
                                  status === "read"
                                    ? "text-green-400"
                                    : "text-slate-400"
                                }`}
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
                );
              })}
            <div
              className={`typing-bubble ${
                isTyping ? "typing-bubble--visible" : ""
              }`}
            >
              <div className="chat chat-start">
                <div className="chat-bubble bg-slate-800 text-slate-200">
                  <div className="typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder name={selectedUser.fullName} />
        )}
      </div>

      <MessageInput />
    </>
  );
}

export default ChatContainer;
