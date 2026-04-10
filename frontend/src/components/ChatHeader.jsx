import { XIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useShallow } from "zustand/react/shallow";

function ChatHeader() {
  const {
    selectedUser,
    setSelectedUser,
    isTyping,
    replyToMessage,
    clearReplyToMessage,
  } = useChatStore(
    useShallow((state) => ({
      selectedUser: state.selectedUser,
      setSelectedUser: state.setSelectedUser,
      isTyping: state.typingByUserId?.[state.selectedUser?._id] || false,
      replyToMessage: state.replyToMessage,
      clearReplyToMessage: state.clearReplyToMessage,
    }))
  );
  const { onlineUsers, lastSeenByUserId, presenceByUserId } = useAuthStore(
    useShallow((state) => ({
      onlineUsers: state.onlineUsers,
      lastSeenByUserId: state.lastSeenByUserId,
      presenceByUserId: state.presenceByUserId,
    }))
  );
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key !== "Escape") return;
      if (replyToMessage) {
        clearReplyToMessage();
        return;
      }
      setSelectedUser(null);
    };

    window.addEventListener("keydown", handleEscKey);

    // cleanup function
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [setSelectedUser, replyToMessage, clearReplyToMessage]);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const intervalId = setInterval(updateNow, 15000);
    return () => clearInterval(intervalId);
  }, []);

  if (!selectedUser) return null;

  const isOnline = onlineUsers?.includes(selectedUser._id);
  const lastSeen =
    presenceByUserId?.[selectedUser._id]?.lastSeenAt ||
    lastSeenByUserId?.[selectedUser._id] ||
    selectedUser.lastSeenAt;
  const lastActiveAt =
    presenceByUserId?.[selectedUser._id]?.lastActiveAt ||
    selectedUser.lastActiveAt;
  const isActiveNow = lastActiveAt && nowMs
    ? nowMs - new Date(lastActiveAt).getTime() < 45000
    : false;

  return (
    <div
      className="flex justify-between items-center bg-slate-800/50 border-b
   border-slate-700/50 max-h-21 px-6 flex-1"
    >
      <div className="flex items-center space-x-3">
        <div className={`avatar ${isOnline ? "online" : "offline"}`}>
          <div className="w-12 rounded-full">
            <img
              src={selectedUser.profilePic || "/avatar.png"}
              alt={selectedUser.fullName}
            />
          </div>
        </div>

        <div>
          <h3 className="text-slate-200 font-medium">
            {selectedUser.fullName}
          </h3>
          <p className="text-xs text-slate-400">@{selectedUser.username}</p>
          <p
            className={`text-sm ${
              isTyping || isActiveNow || isOnline
                ? "status-success"
                : "text-slate-400"
            }`}
          >
            {isTyping
              ? "Typing..."
              : isActiveNow || isOnline
              ? "Active now"
              : lastSeen
              ? `Last seen ${new Date(lastSeen).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Offline"}
          </p>
        </div>
      </div>

      <button onClick={() => setSelectedUser(null)}>
        <XIcon className="w-5 h-5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" />
      </button>
    </div>
  );
}
export default ChatHeader;
