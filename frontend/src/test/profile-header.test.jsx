import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const axiosGetMock = vi.fn();
const updateUsernameMock = vi.fn();

vi.mock("../lib/axios", () => ({
  axiosInstance: {
    get: (...args) => axiosGetMock(...args),
  },
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    authUser: {
      _id: "user1",
      fullName: "Test User",
      username: "test_user",
      profilePic: "",
    },
    logout: vi.fn(),
    updateProfile: vi.fn(),
    updateUsername: updateUsernameMock,
  }),
}));

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => ({
    isSoundEnabled: false,
    toggleSound: vi.fn(),
  }),
}));

import ProfileHeader from "../components/ProfileHeader";

describe("ProfileHeader username update", () => {
  beforeEach(() => {
    axiosGetMock.mockReset();
    updateUsernameMock.mockReset();
    globalThis.Audio = class {
      play() {
        return Promise.resolve();
      }
    };
  });

  it("checks and updates username", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "new_name" },
    });
    updateUsernameMock.mockResolvedValueOnce(true);

    render(<ProfileHeader />);

    const usernameInput = screen.getByPlaceholderText("your_username");
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, "New_Name");

    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    expect(
      await screen.findByText(/this name is available/i)
    ).toBeInTheDocument();

    const updateButton = screen.getByRole("button", { name: /update/i });
    expect(updateButton).toBeEnabled();

    await userEvent.click(updateButton);
    expect(updateUsernameMock).toHaveBeenCalledWith("new_name");
  });
});
