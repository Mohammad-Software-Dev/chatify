import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const getAdminContact = vi.fn();
const setActiveTab = vi.fn();
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

import NoChatsFound from "../components/NoChatsFound";

describe("NoChatsFound", () => {
  beforeEach(() => {
    getAdminContact.mockClear();
    setActiveTab.mockClear();
    setSelectedUser.mockClear();
    storeState = {
      adminContact: null,
      getAdminContact,
      setActiveTab,
      setSelectedUser,
    };
  });

  it("keeps the contacts fallback when no admin contact exists", () => {
    render(<NoChatsFound />);

    expect(getAdminContact).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /find contacts/i }));

    expect(setActiveTab).toHaveBeenCalledWith("contacts");
    expect(setSelectedUser).not.toHaveBeenCalled();
  });

  it("starts a chat with the admin contact when configured", () => {
    storeState.adminContact = adminContact;

    render(<NoChatsFound />);
    fireEvent.click(screen.getByRole("button", { name: /message admin/i }));

    expect(setSelectedUser).toHaveBeenCalledWith(adminContact);
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
