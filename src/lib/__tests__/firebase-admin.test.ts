import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppCheck, getMessaging } from "../firebase/admin";
import {
  type App,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import {
  type AppCheck,
  getAppCheck as getAdminAppCheck,
} from "firebase-admin/app-check";
import {
  getMessaging as getAdminMessaging,
  type Messaging,
} from "firebase-admin/messaging";
import { logger } from "../logger";

const mockApp = { name: "mock-app" };
const mockAppCheckService = {
  verifyToken: vi.fn(),
};
const mockMessagingService = {
  send: vi.fn(),
};

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => mockApp),
  initializeApp: vi.fn(() => mockApp),
  cert: vi.fn((credentials: Record<string, unknown>) => credentials),
}));

vi.mock("firebase-admin/app-check", () => ({
  getAppCheck: vi.fn(() => mockAppCheckService),
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => mockMessagingService),
}));

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("firebase-admin", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(getApps).mockReturnValue([]);
    vi.mocked(getApp).mockReturnValue(mockApp as unknown as App);
    vi.mocked(initializeApp).mockReturnValue(mockApp as unknown as App);
    vi.mocked(cert).mockImplementation((creds: unknown) =>
      creds as ReturnType<typeof cert>
    );
    vi.mocked(getAdminAppCheck).mockReturnValue(
      mockAppCheckService as unknown as AppCheck,
    );
    vi.mocked(getAdminMessaging).mockReturnValue(
      mockMessagingService as unknown as Messaging,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getAppCheck", () => {
    it("returns null if GOOGLE_SERVICE_ACCOUNT_JSON is missing", () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      const verifier = getAppCheck();
      expect(verifier).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("GOOGLE_SERVICE_ACCOUNT_JSON not configured"),
      );
    });

    it("initializes firebase and returns verifier when credentials are provided", async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: "test-project",
      });

      const verifier = getAppCheck();

      expect(verifier).not.toBeNull();
      expect(initializeApp).toHaveBeenCalled();

      mockAppCheckService.verifyToken.mockResolvedValueOnce({
        appId: "test-app",
        token: "mock-token",
      });

      const result = await verifier!.verifyToken("token");
      expect(result.appId).toBe("test-app");
    });

    it("uses existing firebase app if already initialized", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: "test-project",
      });
      vi.mocked(getApps).mockReturnValue([
        { name: "default" } as unknown as App,
      ]);

      getAppCheck();

      expect(getApp).toHaveBeenCalled();
      expect(initializeApp).not.toHaveBeenCalled();
    });

    it("handles base64 encoded credentials", () => {
      const credentials = { project_id: "test-project" };
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(
        JSON.stringify(credentials),
      ).toString("base64");

      getAppCheck();

      expect(cert).toHaveBeenCalledWith(credentials);
    });

    it("returns null if initialization fails", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "invalid-json";

      const verifier = getAppCheck();

      expect(verifier).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it("returns null if token verification fails catastrophically", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: "test-project",
      });
      vi.mocked(getApps).mockReturnValue([
        { name: "default" } as unknown as App,
      ]);
      vi.mocked(getApp).mockImplementationOnce(() => {
        throw new Error("Fatal");
      });

      const verifier = getAppCheck();
      expect(verifier).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("initialization failed"),
        expect.any(Error),
      );
    });

    it("rethrows and logs error on token verification failure", async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: "test-project",
      });
      const verifier = getAppCheck();

      mockAppCheckService.verifyToken.mockRejectedValueOnce(
        new Error("Invalid Token"),
      );

      await expect(verifier!.verifyToken("token")).rejects.toThrow(
        "Invalid Token",
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("verification failed"),
        expect.any(Error),
      );
    });
  });

  describe("getMessaging", () => {
    it("returns null if GOOGLE_SERVICE_ACCOUNT_JSON is missing", () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      const messaging = getMessaging();
      expect(messaging).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("GOOGLE_SERVICE_ACCOUNT_JSON not configured"),
      );
    });

    it("initializes firebase and returns messaging service when credentials are provided", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        project_id: "test-project",
      });
      const messaging = getMessaging();
      expect(messaging).not.toBeNull();
      expect(getAdminMessaging).toHaveBeenCalledWith(mockApp);
    });
  });
});
