import { MessageCircleIcon } from "lucide-react";

const NoChatHistoryPlaceholder = ({ name, username }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 accent-soft border rounded-full flex items-center justify-center mb-5">
        <MessageCircleIcon className="size-8 accent-text-strong" />
      </div>
      <h3 className="text-lg font-medium text-slate-200 mb-3">
        Start your conversation with {name}
      </h3>
      {username ? (
        <p className="text-sm text-slate-400 mb-2">@{username}</p>
      ) : null}
      <div className="flex flex-col space-y-3 max-w-md mb-5">
        <p className="text-slate-400 text-sm">
          This is the beginning of your conversation. Send a message to start
          chatting!
        </p>
        <div className="h-px w-32 bg-gradient-to-r from-transparent via-[var(--accent-border)] to-transparent mx-auto"></div>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        <button className="px-4 py-2 text-xs font-medium accent-soft border rounded-full hover:opacity-90 transition-colors">
          👋 Say Hello
        </button>
        <button className="px-4 py-2 text-xs font-medium accent-soft border rounded-full hover:opacity-90 transition-colors">
          🤝 How are you?
        </button>
        <button className="px-4 py-2 text-xs font-medium accent-soft border rounded-full hover:opacity-90 transition-colors">
          📅 Meet up soon?
        </button>
      </div>
    </div>
  );
};

export default NoChatHistoryPlaceholder;
