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
                return (
                <div
                  key={msg._id}
                  className={`chat ${
                    msg.senderId === authUser._id ? "chat-end" : "chat-start"
                  }`}
                >
                <div
                  className={`chat-bubble relative ${
                    msg.senderId === authUser._id
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-200"
                  }`}
                  onClick={() => handleBubbleClick(msg)}
                  onTouchStart={() => handleTouchStart(msg)}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Shared"
                        className="rounded-lg h-48 object-cover"
                      />
                    )}
                    {msg.text && <p className="mt-2">{msg.text}</p>}
                    <div className="text-xs mt-1 opacity-75 flex items-center gap-1">
                      <span>
                        {new Date(getMessageTime(msg) || Date.now()).toLocaleTimeString(
                          undefined,
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </span>
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
                                  msg.deliveredAt ||
                                    getMessageTime(msg) ||
                                    Date.now()
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
                    {msg.senderId === authUser._id &&
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
