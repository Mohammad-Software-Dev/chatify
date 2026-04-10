import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const makeSocket = () => ({
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
});

describe("socket store ownership", () => {
  beforeEach(() => {
    useChatStore.getState().unsubscribeFromMessages();
    useAuthStore.setState({
      authUser: { _id: "me" },
      socket: null,
      onlineUsers: [],
      lastSeenByUserId: {},
      presenceByUserId: {},
    });
  });

  it("unsubscribes only the chat socket listener", () => {
    const socket = makeSocket();
    useAuthStore.setState({ socket });

    useChatStore.getState().subscribeToMessages();

    expect(socket.on).toHaveBeenCalledWith("socket:event", expect.any(Function));
    const handler = socket.on.mock.calls[0][1];
    expect(socket.off).not.toHaveBeenCalledWith("socket:event");

    useChatStore.getState().unsubscribeFromMessages();

    expect(socket.off).toHaveBeenCalledWith("socket:event", handler);
  });

  it("clears socket and presence state on disconnect", () => {
    const socket = makeSocket();
    useAuthStore.setState({
      socket,
      onlineUsers: ["user1"],
      lastSeenByUserId: { user1: "2026-01-01T00:00:00.000Z" },
      presenceByUserId: { user1: { isOnline: true } },
    });

    useAuthStore.getState().disconnectSocket();

    const state = useAuthStore.getState();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(state.socket).toBeNull();
    expect(state.onlineUsers).toEqual([]);
    expect(state.lastSeenByUserId).toEqual({});
    expect(state.presenceByUserId).toEqual({});
  });
});
