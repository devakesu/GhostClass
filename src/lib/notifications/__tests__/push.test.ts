import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPushNotification } from "../push";
import { getMessaging } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

vi.mock("@/lib/firebase/admin", () => ({
  getMessaging: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  redact: () => "redacted-token-placeholder",
}));

describe("sendPushNotification", () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMessaging).mockReturnValue({ send: mockSend } as any);
  });

  it("returns failure when messaging service is unavailable", async () => {
    vi.mocked(getMessaging).mockReturnValueOnce(null as any);
    const result = await sendPushNotification({
      token: "test-token",
      title: "Hello",
      body: "World",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it("successfully dispatches notification with sanitized data", async () => {
    mockSend.mockResolvedValueOnce("message-id-789");
    const result = await sendPushNotification({
      token: "test-token-123",
      title: "Test Title",
      body: "Test Body",
      data: { topic: "updates", empty: null as any, num: 42 as any },
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("message-id-789");
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "test-token-123",
        notification: { title: "Test Title", body: "Test Body" },
        data: { topic: "updates", num: "42" },
      }),
    );
  });

  it("handles push dispatch exceptions gracefully", async () => {
    mockSend.mockRejectedValueOnce(new Error("Network timeout"));
    const result = await sendPushNotification({
      token: "test-token-123",
      title: "Test Title",
      body: "Test Body",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
    expect(logger.error).toHaveBeenCalled();
  });

  it("handles terminal token errors correctly", async () => {
    const tokenError = new Error("Invalid token");
    (tokenError as any).code = "messaging/invalid-registration-token";
    mockSend.mockRejectedValueOnce(tokenError);

    const result = await sendPushNotification({
      token: "test-token-123",
      title: "Test Title",
      body: "Test Body",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid token");
  });
});
