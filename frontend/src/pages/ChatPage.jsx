import { useChatStore } from "../store/useChatStore";

import BorderAnimatedContainer from "../components/BorderAnimatedContainer";
import ProfileHeader from "../components/ProfileHeader";
import ActiveTabSwitch from "../components/ActiveTabSwitch";
import ChatsList from "../components/ChatsList";
import ContactList from "../components/ContactList";
import ChatContainer from "../components/ChatContainer";
import NoConversationPlaceholder from "../components/NoConversationPlaceholder";
import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { shallow } from "zustand/shallow";

function ChatPage() {
  const {
    activeTab,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    processPendingQueue,
  } = useChatStore(
    (state) => ({
      activeTab: state.activeTab,
      selectedUser: state.selectedUser,
      subscribeToMessages: state.subscribeToMessages,
      unsubscribeFromMessages: state.unsubscribeFromMessages,
      processPendingQueue: state.processPendingQueue,
    }),
    shallow
  );
  const { socket } = useAuthStore((state) => ({ socket: state.socket }), shallow);

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


  return (
    <div className="relative w-full max-w-6xl h-200">
      <BorderAnimatedContainer>
        {/* LEFT SIDE */}
        <div className="w-80 bg-slate-800/50 backdrop-blur-sm flex flex-col">
          <ProfileHeader />
          <ActiveTabSwitch />

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
