import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const getAllContacts = vi.fn();

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => ({
    getAllContacts,
    allContacts: [],
    setSelectedUser: vi.fn(),
    isUsersLoading: false,
    unreadByUserId: {},
  }),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    onlineUsers: [],
  }),
}));

import ContactList from "../components/ContactList";

describe("ContactList search", () => {
  beforeEach(() => {
    getAllContacts.mockClear();
  });

  it("debounces username search and calls API with query", async () => {
    vi.useFakeTimers();
    render(<ContactList />);

    const input = screen.getByPlaceholderText(/type a username/i);
    fireEvent.change(input, { target: { value: "mike" } });

    expect(getAllContacts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(310);
    expect(getAllContacts).toHaveBeenCalledWith("mike");
    vi.useRealTimers();
  });
});
