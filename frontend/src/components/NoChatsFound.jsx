import { useEffect } from "react";
import { MessageCircleIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useShallow } from "zustand/react/shallow";

function NoChatsFound() {
  const { adminContact, getAdminContact, setActiveTab, setSelectedUser } =
    useChatStore(
      useShallow((state) => ({
        adminContact: state.adminContact,
        getAdminContact: state.getAdminContact,
        setActiveTab: state.setActiveTab,
        setSelectedUser: state.setSelectedUser,
      }))
    );

  useEffect(() => {
    getAdminContact();
  }, [getAdminContact]);

  const handleStartChat = () => {
    if (adminContact) {
      setSelectedUser(adminContact);
      return;
    }
    setActiveTab("contacts");
  };

  const helperText = adminContact
    ? "Start by messaging the admin."
    : "Start a new chat by selecting a contact from the contacts tab";
  const buttonText = adminContact ? "Message admin" : "Find contacts";

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
      <div className="w-16 h-16 accent-soft border rounded-full flex items-center justify-center">
        <MessageCircleIcon className="w-8 h-8 accent-text-strong" />
      </div>
      <div>
        <h4 className="text-slate-200 font-medium mb-1">
          No conversations yet
        </h4>
        <p className="text-slate-400 text-sm px-6">{helperText}</p>
      </div>
      <button
        onClick={handleStartChat}
        className="px-4 py-2 text-sm accent-soft border rounded-lg hover:opacity-90 transition-colors"
      >
        {buttonText}
      </button>
    </div>
  );
}
export default NoChatsFound;
