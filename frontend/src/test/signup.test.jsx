import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const signupMock = vi.fn();
const axiosGetMock = vi.fn();
const DEFAULT_RANDOM = 234 / 9000;

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
  let randomSpy;

  beforeEach(() => {
    signupMock.mockClear();
    axiosGetMock.mockReset();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(DEFAULT_RANDOM);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

  it("auto-checks the generated username on first render", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "user_1234" },
    });

    renderPage();

    expect(
      await screen.findByText(/^available$/i)
    ).toBeInTheDocument();
    expect(axiosGetMock).toHaveBeenCalledWith(
      "/auth/check-username?username=user_1234"
    );
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).not.toBeDisabled();
  });

  it("requires re-checking after the user edits the username", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "user_1234" },
    });

    renderPage();
    await screen.findByText(/^available$/i);

    const usernameInput = screen.getByPlaceholderText("user_1234");
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, "custom_name");

    expect(screen.queryByText(/^available$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/check username to continue/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeDisabled();
  });

  it("supports checking a custom username after editing", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "user_1234" },
    });
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "user_7777" },
    });

    renderPage();
    await screen.findByText(/^available$/i);

    const usernameInput = screen.getByPlaceholderText("user_1234");
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, "user_7777");

    expect(
      screen.getByText(/check username to continue/i)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    expect(await screen.findByText(/^available$/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/check username to continue/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).not.toBeDisabled();
  });

  it("shows taken username state and suggestions after manual check", async () => {
    axiosGetMock.mockResolvedValueOnce({
      data: { available: true, normalizedUsername: "user_1234" },
    });
    axiosGetMock.mockResolvedValueOnce({
      data: {
        available: false,
        normalizedUsername: "user_0000",
        suggestions: ["user_1111", "user_2222", "user_3333"],
      },
    });

    renderPage();
    await screen.findByText(/^available$/i);

    const usernameInput = screen.getByPlaceholderText("user_1234");
    await userEvent.clear(usernameInput);
    await userEvent.type(usernameInput, "user_0000");

    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    expect(
      await screen.findByText(/this username is already taken/i)
    ).toBeInTheDocument();
    expect(screen.getByText("user_1111")).toBeInTheDocument();
    expect(screen.queryByText(/^available$/i)).not.toBeInTheDocument();
  });

  it("retries generated usernames until one is available", async () => {
    randomSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1 / 9);
    axiosGetMock
      .mockResolvedValueOnce({
        data: { available: false, normalizedUsername: "user_1000", suggestions: [] },
      })
      .mockResolvedValueOnce({
        data: { available: true, normalizedUsername: "user_2000" },
      });

    renderPage();

    expect(await screen.findByText(/^available$/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("user_2000")).toBeInTheDocument();
    expect(axiosGetMock).toHaveBeenNthCalledWith(
      1,
      "/auth/check-username?username=user_1000"
    );
    expect(axiosGetMock).toHaveBeenNthCalledWith(
      2,
      "/auth/check-username?username=user_2000"
    );
  });

  it("falls back to manual checking after exhausting auto-generated retries", async () => {
    randomSpy
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1 / 9)
      .mockReturnValueOnce(2 / 9)
      .mockReturnValueOnce(3 / 9)
      .mockReturnValueOnce(4 / 9)
      .mockReturnValueOnce(5 / 9);
    axiosGetMock.mockResolvedValue({
      data: { available: false, normalizedUsername: "taken_name", suggestions: [] },
    });

    renderPage();

    await waitFor(() => {
      expect(axiosGetMock).toHaveBeenCalledTimes(5);
    });
    expect(
      screen.getByText(/check username to continue/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeDisabled();
    expect(screen.queryByText(/this username is already taken/i)).not.toBeInTheDocument();
  });

  it("does not get stuck checking in React strict mode", async () => {
    axiosGetMock.mockResolvedValue({
      data: { available: true, normalizedUsername: "user_1234" },
    });

    render(
      <StrictMode>
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      </StrictMode>
    );

    expect(await screen.findByText(/^available$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check/i })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).not.toBeDisabled();
  });
});
