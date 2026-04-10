import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/axios", () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { axiosInstance } from "../lib/axios";
import { resetRegisteredStores } from "../store/resetRegistry";
import { useChatStore } from "../store/useChatStore";

const adminContact = {
  _id: "admin1",
  fullName: "Admin User",
  username: "admin_user",
};

describe("admin contact store behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().resetForLogout();
  });

  it("caches the admin contact after the first load", async () => {
    axiosInstance.get.mockResolvedValueOnce({ data: adminContact });

    const firstResult = await useChatStore.getState().getAdminContact();
    const secondResult = await useChatStore.getState().getAdminContact();

    expect(firstResult).toEqual(adminContact);
    expect(secondResult).toEqual(adminContact);
    expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().hasLoadedAdminContact).toBe(true);
  });

  it("clears cached admin state through the auth reset registry", () => {
    useChatStore.setState({
      adminContact,
      isAdminContactLoading: true,
      hasLoadedAdminContact: true,
    });

    resetRegisteredStores();

    expect(useChatStore.getState().adminContact).toBeNull();
    expect(useChatStore.getState().isAdminContactLoading).toBe(false);
    expect(useChatStore.getState().hasLoadedAdminContact).toBe(false);
  });
});
