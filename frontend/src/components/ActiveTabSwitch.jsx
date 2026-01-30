import { useChatStore } from "../store/useChatStore";
import { useShallow } from "zustand/react/shallow";

function ActiveTabSwitch() {
  const { activeTab, setActiveTab } = useChatStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
    }))
  );

  return (
    <div className="tabs tabs-box bg-transparent p-2 m-2 ">
      <button
        onClick={() => setActiveTab("chats")}
        className={`tab ${
          activeTab === "chats"
            ? "accent-soft border accent-text-strong"
            : "text-slate-400"
        }`}
      >
        Chats
      </button>

      <button
        onClick={() => setActiveTab("contacts")}
        className={`tab ${
          activeTab === "contacts"
            ? "accent-soft border accent-text-strong"
            : "text-slate-400"
        }`}
      >
        Contacts
      </button>
    </div>
  );
}
export default ActiveTabSwitch;
