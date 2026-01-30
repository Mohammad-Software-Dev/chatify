import { MessageCircleIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useShallow } from "zustand/react/shallow";

function NoChatsFound() {
  const { setActiveTab } = useChatStore(
    useShallow((state) => ({ setActiveTab: state.setActiveTab }))
  );

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
      <div className="w-16 h-16 accent-soft border rounded-full flex items-center justify-center">
        <MessageCircleIcon className="w-8 h-8 accent-text-strong" />
      </div>
      <div>
        <h4 className="text-slate-200 font-medium mb-1">
          No conversations yet
        </h4>
        <p className="text-slate-400 text-sm px-6">
          Start a new chat by selecting a contact from the contacts tab
        </p>
      </div>
      <button
        onClick={() => setActiveTab("contacts")}
        className="px-4 py-2 text-sm accent-soft border rounded-lg hover:opacity-90 transition-colors"
      >
        Find contacts
      </button>
    </div>
  );
}
export default NoChatsFound;
