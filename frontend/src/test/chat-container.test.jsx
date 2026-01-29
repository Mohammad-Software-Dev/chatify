import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const searchMessages = vi.fn();
const clearSearchResults = vi.fn();

vi.mock("../components/MessageInput", () => ({
  default: () => null,
}));

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => ({
    selectedUser: { _id: "user1", fullName: "User One" },
    getMessagesByUserId: vi.fn(),
    messages: [],
    isMessagesLoading: false,
    loadOlderMessages: vi.fn(),
    isLoadingMoreMessages: false,
    hasMoreMessages: false,
    typingByUserId: {},
    setReplyToMessage: vi.fn(),
    addReaction: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    searchMessages,
    clearSearchResults,
    searchResults: [],
    isSearching: false,
    pinnedMessages: [],
    starredMessages: [],
    loadPinnedMessages: vi.fn(),
    loadStarredMessages: vi.fn(),
    togglePin: vi.fn(),
    toggleStar: vi.fn(),
    fetchMessageById: vi.fn(),
  }),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    authUser: { _id: "user1" },
    onlineUsers: [],
    lastSeenByUserId: {},
    presenceByUserId: {},
  }),
}));

import ChatContainer from "../components/ChatContainer";

describe("ChatContainer search", () => {
  it("calls search when typing in search input", async () => {
    render(<ChatContainer />);
    const timeoutSpy = vi
      .spyOn(global, "setTimeout")
      .mockImplementation((fn) => {
        fn();
        return 0;
      });

    const input = screen.getByPlaceholderText(/search messages/i);
    fireEvent.change(input, { target: { value: "hello" } });
    expect(searchMessages).toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });
});
