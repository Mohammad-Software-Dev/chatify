import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { SearchIcon, XIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

function ContactList() {
  const {
    adminContact,
    getAdminContact,
    getAllContacts,
    allContacts,
    setSelectedUser,
    isContactSearching,
    unreadByUserId,
    selectedUser,
  } = useChatStore(
    useShallow((state) => ({
      adminContact: state.adminContact,
      getAdminContact: state.getAdminContact,
      getAllContacts: state.getAllContacts,
      allContacts: state.allContacts,
      setSelectedUser: state.setSelectedUser,
      isContactSearching: state.isContactSearching,
      unreadByUserId: state.unreadByUserId,
      selectedUser: state.selectedUser,
    }))
  );
  const { onlineUsers } = useAuthStore(
    useShallow((state) => ({ onlineUsers: state.onlineUsers }))
  );
  const [query, setQuery] = useState("");
  const visibleContacts = adminContact
    ? allContacts.filter((contact) => contact._id !== adminContact._id)
    : allContacts;

  const renderContact = (contact, { isAdmin = false } = {}) => (
    <div
      key={contact._id}
      className={`border p-4 rounded-lg cursor-pointer transition-colors ${
        selectedUser?._id === contact._id
          ? "selected-chat"
          : "accent-soft hover:opacity-90"
      }`}
      onClick={() => setSelectedUser(contact)}
    >
      <div className="flex items-center gap-3 justify-between">
        <div
          className={`avatar ${
            onlineUsers?.includes(contact._id) ? "online" : "offline"
          }`}
        >
          <div className="size-12 rounded-full">
            <img
              src={contact.profilePic || "/avatar.png"}
              alt={contact.fullName}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-slate-200 font-medium truncate">
              {contact.fullName}
            </h4>
            {isAdmin ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide accent-bg px-2 py-0.5 rounded-full">
                Admin
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-400 truncate">@{contact.username}</p>
        </div>
        {unreadByUserId[contact._id] > 0 && (
          <span className="text-xs font-semibold accent-bg px-2 py-0.5 rounded-full">
            {unreadByUserId[contact._id]}
          </span>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    getAdminContact();
  }, [getAdminContact]);

  useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(() => {
      if (trimmed.length < 3) {
        getAllContacts("");
        return;
      }
      getAllContacts(trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [getAllContacts, query]);

  return (
    <>
      <div className="mb-4">
        <label className="auth-input-label">Search by username</label>
        <div className="relative">
          <SearchIcon className="auth-input-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input"
            placeholder="Type a username..."
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <XIcon className="w-4 h-4" />
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Enter a username to find people to chat with.
        </p>
        {isContactSearching ? (
          <p className="text-xs text-slate-400 mt-2">Searching...</p>
        ) : null}
      </div>
      {query.trim().length === 0 && (
        <div className="text-sm text-slate-400">
          Start typing a username to see results.
        </div>
      )}
      {adminContact ? renderContact(adminContact, { isAdmin: true }) : null}
      {visibleContacts.map((contact) => renderContact(contact))}
      {query.trim().length > 0 &&
        visibleContacts.length === 0 &&
        !isContactSearching && (
        <div className="text-sm text-slate-400">No users found.</div>
      )}
    </>
  );
}
export default ContactList;
