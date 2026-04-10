import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const getAllContacts = vi.fn();
const getAdminContact = vi.fn();
const setSelectedUser = vi.fn();
const adminContact = {
  _id: "admin1",
  fullName: "Admin User",
  username: "admin_user",
  profilePic: "",
};
let storeState;

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => storeState,
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
    getAdminContact.mockClear();
    setSelectedUser.mockClear();
    storeState = {
      adminContact: null,
      getAdminContact,
      getAllContacts,
      allContacts: [],
      setSelectedUser,
      isContactSearching: false,
      unreadByUserId: {},
      selectedUser: null,
    };
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

  it("fetches and renders the admin contact", () => {
    storeState.adminContact = adminContact;

    render(<ContactList />);

    expect(getAdminContact).toHaveBeenCalled();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders admin before searched contacts and avoids duplicates", () => {
    storeState.adminContact = adminContact;
    storeState.allContacts = [
      adminContact,
      {
        _id: "user1",
        fullName: "Mike User",
        username: "mike_user",
        profilePic: "",
      },
    ];

    const { container } = render(<ContactList />);

    expect(screen.getAllByText("Admin User")).toHaveLength(1);
    expect(container.textContent.indexOf("Admin User")).toBeLessThan(
      container.textContent.indexOf("Mike User")
    );
  });

  it("selects the pinned admin contact", () => {
    storeState.adminContact = adminContact;

    render(<ContactList />);
    fireEvent.click(screen.getByText("Admin User"));

    expect(setSelectedUser).toHaveBeenCalledWith(adminContact);
  });
});
