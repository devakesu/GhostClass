import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchNotifications, createNotification, markNotificationRead } from "../notifications";
import axios from "@/lib/axios";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("notifications.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchNotifications calls axios.get with correct params", async () => {
    const mockData = { items: [] };
    vi.mocked(axios.get).mockResolvedValue({ data: mockData });

    const result = await fetchNotifications(2, 20);
    
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/manage-notifications"), {
      params: { page: 2, limit: 20 }
    });
    expect(result).toBe(mockData);
  });

  it("createNotification calls axios.post with correct data", async () => {
    const mockData = { title: "Test", description: "Desc" };
    const mockResponse = { success: true };
    vi.mocked(axios.post).mockResolvedValue({ data: mockResponse });

    const result = await createNotification(mockData);
    
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining("/manage-notifications"), mockData);
    expect(result).toBe(mockResponse);
  });

  it("markNotificationRead calls axios.patch with correct data", async () => {
    const mockResponse = { success: true };
    vi.mocked(axios.patch).mockResolvedValue({ data: mockResponse });

    const result = await markNotificationRead(123, true);
    
    expect(axios.patch).toHaveBeenCalledWith(expect.stringContaining("/manage-notifications"), { id: 123, all: true });
    expect(result).toBe(mockResponse);
  });
});
