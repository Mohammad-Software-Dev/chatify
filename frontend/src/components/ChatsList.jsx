import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "../store/useAuthStore";
import { useShallow } from "zustand/react/shallow";

function ChatsList() {
  const {
    getMyChatPartners,
    chats,
    isUsersLoading,
    setSelectedUser,
    typingByUserId,
    selectedUser,
  } = useChatStore(
    useShallow((state) => ({
      getMyChatPartners: state.getMyChatPartners,
      chats: state.chats,
      isUsersLoading: state.isUsersLoading,
      setSelectedUser: state.setSelectedUser,
      typingByUserId: state.typingByUserId,
      selectedUser: state.selectedUser,
    }))
  );
  const { onlineUsers, authUser } = useAuthStore(
    useShallow((state) => ({
      onlineUsers: state.onlineUsers,
      authUser: state.authUser,
    }))
  );

  useEffect(() => {
    getMyChatPartners();
  }, [getMyChatPartners]);

  if (isUsersLoading) return <UsersLoadingSkeleton />;
  if (chats.length === 0) return <NoChatsFound />;

  return (
    <>
      {chats.map((chat) => (
        <div
          key={chat._id}
          className={`border p-4 rounded-lg cursor-pointer transition-colors ${
            selectedUser?._id === chat._id
              ? "selected-chat"
              : "accent-soft hover:opacity-90"
          }`}
          onClick={() => setSelectedUser(chat)}
        >
          <div className="flex items-center gap-3 justify-between">
            <div
              className={`avatar ${
                onlineUsers?.includes(chat._id) ? "online" : "offline"
              }`}
            >
              <div className="size-12 rounded-full">
                <img
                  src={chat.profilePic || "/avatar.png"}
                  alt={chat.fullName}
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-slate-200 font-medium truncate">
                    {chat.fullName}
                  </h4>
                  <p className="text-xs text-slate-400 truncate">
                    @{chat.username}
                  </p>
                </div>
                {chat.lastMessageAt && (
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(chat.lastMessageAt).toLocaleTimeString(
                      undefined,
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </span>
                )}
              </div>
              {typingByUserId?.[chat._id] ? (
                <p className="text-xs status-success truncate">Typing...</p>
              ) : (
                <p className="text-xs text-slate-400 truncate">
                  {chat.lastMessageSenderId === authUser?._id ? "You: " : ""}
                  {chat.lastMessageText
                    ? chat.lastMessageText
                    : chat.lastMessageImages?.length > 1
                    ? "Photos"
                    : chat.lastMessageImage
                    ? "Image"
                    : "No messages yet"}
                </p>
              )}
            </div>
            {chat.unreadCount > 0 && (
              <span className="text-xs font-semibold accent-bg px-2 py-0.5 rounded-full">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
export default ChatsList;
