import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../hooks/useKeyboardSound", () => ({
  default: () => ({ playRandomKeyStrokeSound: vi.fn() }),
}));

const storeState = {
  sendMessage: vi.fn(),
  isSoundEnabled: false,
  emitTypingStart: vi.fn(),
  emitTypingStop: vi.fn(),
  replyToMessage: null,
  clearReplyToMessage: vi.fn(),
  selectedUser: { _id: "user1" },
};

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => storeState,
}));

import MessageInput from "../components/MessageInput";

describe("MessageInput drag & drop", () => {
  it("shows drag overlay on drag enter and hides on drag leave", () => {
    render(<MessageInput />);

    const input = screen.getByPlaceholderText("Type your message...");
    const container = input.closest("div.relative");
    expect(container).toBeTruthy();

    fireEvent.dragEnter(container, { dataTransfer: { items: [] } });
    expect(screen.getByText(/drop images to attach/i)).toBeInTheDocument();

    fireEvent.dragLeave(container, { dataTransfer: { items: [] } });
    expect(
      screen.queryByText(/drop images to attach/i)
    ).not.toBeInTheDocument();
  });
});
