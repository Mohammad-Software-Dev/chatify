import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "../store/useAuthStore";

function ChatsList() {
  const { getMyChatPartners, chats, isUsersLoading, setSelectedUser } =
    useChatStore();
  const { onlineUsers, authUser } = useAuthStore();

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
          className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
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
                <h4 className="text-slate-200 font-medium truncate">
                  {chat.fullName}
                </h4>
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
              <p className="text-xs text-slate-400 truncate">
                {chat.lastMessageSenderId === authUser?._id ? "You: " : ""}
                {chat.lastMessageText
                  ? chat.lastMessageText
                  : chat.lastMessageImage
                  ? "Image"
                  : "No messages yet"}
              </p>
            </div>
            {chat.unreadCount > 0 && (
              <span className="text-xs font-semibold bg-cyan-500 text-slate-900 px-2 py-0.5 rounded-full">
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
