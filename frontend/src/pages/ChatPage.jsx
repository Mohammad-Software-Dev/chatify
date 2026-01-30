import { useChatStore } from "../store/useChatStore";

import BorderAnimatedContainer from "../components/BorderAnimatedContainer";
import ProfileHeader from "../components/ProfileHeader";
import ActiveTabSwitch from "../components/ActiveTabSwitch";
import ChatsList from "../components/ChatsList";
import ContactList from "../components/ContactList";
import ChatContainer from "../components/ChatContainer";
import NoConversationPlaceholder from "../components/NoConversationPlaceholder";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { SearchIcon, XIcon } from "lucide-react";

function ChatPage() {
  const {
    activeTab,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    searchAllMessages,
    clearGlobalSearchResults,
    globalSearchResults,
    isGlobalSearching,
    chats,
    setSelectedUser,
    setPendingScrollMessageId,
  } = useChatStore();
  const { processPendingQueue } = useChatStore();
  const { socket, authUser } = useAuthStore();
  const [globalQuery, setGlobalQuery] = useState("");

  useEffect(() => {
    if (!socket) return;
    subscribeToMessages();
    processPendingQueue();
    return () => unsubscribeFromMessages();
  }, [socket, subscribeToMessages, unsubscribeFromMessages, processPendingQueue]);

  useEffect(() => {
    const handleOnline = () => processPendingQueue();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [processPendingQueue]);

  useEffect(() => {
    if (!socket) return;
    const intervalId = setInterval(() => {
      socket.emit("presence:ping");
    }, 20000);

    return () => clearInterval(intervalId);
  }, [socket]);

  useEffect(() => {
    if (!globalQuery.trim()) {
      clearGlobalSearchResults();
      return;
    }
    const timer = setTimeout(() => {
      searchAllMessages(globalQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalQuery, searchAllMessages, clearGlobalSearchResults]);

  const groupedResults = useMemo(() => {
    if (!globalQuery.trim()) return [];
    const groups = new Map();
    globalSearchResults.forEach((msg) => {
      const partner = findChatPartner(msg);
      const key = partner?._id || "unknown";
      if (!groups.has(key)) {
        groups.set(key, {
          partner,
          items: [],
        });
      }
      groups.get(key).items.push(msg);
    });
    return Array.from(groups.values());
  }, [globalQuery, globalSearchResults, chats, authUser?._id]);

  const findChatPartner = (message) => {
    const otherId =
      String(message.senderId) === String(authUser?._id)
        ? message.receiverId
        : message.senderId;
    return chats.find((chat) => String(chat._id) === String(otherId));
  };

  const highlightMatch = (text, query) => {
    if (!text || !query) return text || "";
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      regex.test(part) ? (
        <mark
          key={`${part}-${idx}`}
          className="bg-cyan-500/20 text-cyan-100 rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      )
    );
  };

  return (
    <div className="relative w-full max-w-6xl h-200">
      <BorderAnimatedContainer>
        {/* LEFT SIDE */}
        <div className="w-80 bg-slate-800/50 backdrop-blur-sm flex flex-col">
          <ProfileHeader />
          <ActiveTabSwitch />

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <div className="mb-3">
              <label className="auth-input-label">Search all messages</label>
              <div className="relative">
                <SearchIcon className="auth-input-icon" />
                <input
                  type="text"
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  className="input"
                  placeholder="Search across chats..."
                />
                {globalQuery ? (
                  <button
                    type="button"
                    onClick={() => setGlobalQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>
            {globalQuery.trim().length > 0 && (
              <div className="mb-4 max-h-48 overflow-y-auto space-y-2">
                {isGlobalSearching && (
                  <div className="text-xs text-slate-400">Searching…</div>
                )}
                {!isGlobalSearching && groupedResults.length === 0 && (
                  <div className="text-xs text-slate-400">No results.</div>
                )}
                {groupedResults.map((group) => (
                  <div
                    key={group.partner?._id || "unknown"}
                    className="rounded-lg border border-slate-700/60 bg-slate-900/30"
                  >
                    <div className="px-3 py-2 text-xs text-slate-300 border-b border-slate-700/60">
                      {group.partner?.fullName || "Unknown user"}
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {group.items.map((msg) => (
                        <button
                          key={msg._id}
                          type="button"
                          onClick={() => {
                            if (!group.partner) return;
                            setSelectedUser(group.partner);
                            setPendingScrollMessageId(msg._id);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              {msg.text
                                ? highlightMatch(msg.text, globalQuery)
                                : msg.images?.length > 0 || msg.image
                                ? "Image"
                                : "Message"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(
                                msg.createdAt || msg.sentAt || Date.now()
                              ).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "chats" ? <ChatsList /> : <ContactList />}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex-1 flex flex-col bg-slate-900/50 backdrop-blur-sm">
          {selectedUser ? <ChatContainer /> : <NoConversationPlaceholder />}
        </div>
      </BorderAnimatedContainer>
    </div>
  );
}
export default ChatPage;
