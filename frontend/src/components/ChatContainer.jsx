import { useEffect, useRef } from "react";
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
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);

  useEffect(() => {
    getMessagesByUserId(selectedUser._id);
  }, [selectedUser, getMessagesByUserId]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <>
      <ChatHeader />
      <div className="flex-1 px-6 overflow-y-auto py-8">
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {hasMoreMessages && (
              <div className="flex justify-center">
                <button
                  onClick={loadOlderMessages}
                  disabled={isLoadingMoreMessages}
                  className="text-slate-300 text-sm px-3 py-1 rounded-full bg-slate-800/60 hover:bg-slate-700/60 transition-colors disabled:opacity-50"
                >
                  {isLoadingMoreMessages ? "Loading..." : "Load older messages"}
                </button>
              </div>
            )}
            {messages.map((msg) => {
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
                        {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {msg.senderId === authUser._id && (
                        <span
                          className="flex items-center"
                          title={
                            status === "read"
                              ? `Read ${new Date(
                                  msg.readAt || msg.createdAt
                                ).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : status === "delivered"
                              ? `Delivered ${new Date(
                                  msg.deliveredAt || msg.createdAt
                                ).toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : `Sent ${new Date(
                                  msg.sentAt || msg.createdAt
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
                                  ? "text-blue-300"
                                  : "text-slate-200"
                              }`}
                            />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* 👇 scroll target */}
            <div ref={messageEndRef} />
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
