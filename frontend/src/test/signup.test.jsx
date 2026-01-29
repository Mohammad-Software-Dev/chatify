import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const signupMock = vi.fn();
const axiosGetMock = vi.fn();

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    signup: signupMock,
    isSigningUp: false,
  }),
}));

vi.mock("../lib/axios", () => ({
  axiosInstance: {
    get: (...args) => axiosGetMock(...args),
  },
}));

import SignUpPage from "../pages/SignUpPage";

describe("SignUpPage username check", () => {
  beforeEach(() => {
    signupMock.mockClear();
    axiosGetMock.mockReset();
  });

  it("shows available username state after check", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "user_1234" },
    });

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    const usernameInput = screen.getByPlaceholderText("user_1234");
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, "user_1234");

    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    expect(
      await screen.findByText(/this name is available/i)
    ).toBeInTheDocument();
  });

  it("shows taken username state and suggestions", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: {
        available: false,
        suggestions: ["user_1111", "user_2222", "user_3333"],
      },
    });

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    const usernameInput = screen.getByPlaceholderText("user_1234");
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, "user_0000");

    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    expect(
      await screen.findByText(/this username is already taken/i)
    ).toBeInTheDocument();
    expect(screen.getByText("user_1111")).toBeInTheDocument();
  });
});
