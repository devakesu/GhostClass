/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotificationsPage from "../NotificationsClient";

// Mock all required hooks and dependencies
const MOCK_NOTIFICATIONS_VAL = {
  actionNotifications: [],
  regularNotifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  markAsRead: vi.fn(),
  toggleRead: vi.fn(),
  markAllAsRead: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

vi.mock("@/hooks/notifications/useNotifications", () => ({
  useNotifications: vi.fn(() => MOCK_NOTIFICATIONS_VAL),
}));

const MOCK_USER_DATA = {
  id: "123",
  email: "test@example.com",
  username: "testuser",
};
const MOCK_USER_VAL = { data: MOCK_USER_DATA, isLoading: false };
vi.mock("@/hooks/users/user", () => ({
  useUser: () => MOCK_USER_VAL,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

const MOCK_MEASURE_EL = vi.fn();
const MOCK_MEASURE = vi.fn();
const MOCK_SCROLL = vi.fn();

vi.mock("@/hooks/notifications/use-notification-virtualizer", () => ({
  useNotificationVirtualizer: vi.fn(({ virtualItems }) => ({
    getTotalSize: () => virtualItems.length * 100,
    getVirtualItems: () =>
      virtualItems.map((item: any, index: number) => ({
        index,
        start: index * 100,
        size: 100,
        key: item.id,
        measureElement: MOCK_MEASURE_EL,
      })),
    measureElement: MOCK_MEASURE_EL,
    measure: MOCK_MEASURE,
    scrollToIndex: MOCK_SCROLL,
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@/hooks/use-sync-on-mount", () => ({
  useSyncOnMount: vi.fn(() => ({
    isSyncing: false,
    syncSettled: true,
    syncFailed: false,
  })),
}));

vi.mock("@/components/loading", () => ({
  Loading: () => <div role="status">Loading...</div>,
}));

describe("NotificationsClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("CSS Hover Effects (Line 47)", () => {
    it("should apply hover:shadow-md class to unread notifications", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 1,
            title: "Test Notification",
            description: "Test description",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "sync",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: vi.fn(),
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      // Mock sync completion
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      // Wait for sync to complete and notification to render
      await waitFor(() => {
        expect(screen.queryByText("Test Notification")).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        const notification = screen.getByText("Test Notification").closest(
          'div[role="button"]',
        );
        expect(notification).toBeInTheDocument();
        // Verify the hover:shadow-md class is present
        expect(notification?.className).toContain("hover:shadow-md");
      });
    });

    it("should not apply hover:shadow-md class to read notifications", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 1,
            title: "Read Notification",
            description: "Test description",
            is_read: true,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "sync",
          },
        ],
        unreadCount: 0,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: vi.fn(),
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      // Mock sync completion
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      // Wait for sync to complete and notification to render
      await waitFor(() => {
        expect(screen.queryByText("Read Notification")).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        const notification = screen.getByText("Read Notification").closest(
          'div[role="button"]',
        );
        expect(notification).toBeInTheDocument();
        // Read notifications should not have hover:shadow-md
        expect(notification?.className).not.toContain("hover:shadow-md");
      });
    });

    it("should apply cursor-pointer class for unread notifications", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 1,
            title: "Unread Notification",
            description: "Test description",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "attendance",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: vi.fn(),
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      // Mock sync completion
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      // Wait for sync to complete and notification to render
      await waitFor(() => {
        expect(screen.queryByText("Unread Notification")).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        const notification = screen.getByText("Unread Notification").closest(
          'div[role="button"]',
        );
        expect(notification).toBeInTheDocument();
        expect(notification?.className).toContain("cursor-pointer");
      });
    });
  });

  describe("getNotificationIcon – default (unknown topic)", () => {
    it("renders an unread notification with an unknown topic without crashing", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 5,
            title: "Unknown Topic Notification",
            description: "No topic match",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "random-unknown-topic",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: vi.fn(),
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Unknown Topic Notification"))
          .toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("renders an unread notification with no topic at all without crashing", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 6,
            title: "No Topic Notification",
            description: "topic is undefined",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: vi.fn(),
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      await waitFor(() => {
        expect(screen.queryByText("No Topic Notification")).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe("Notification click and keyboard interaction", () => {
    it("calls toggleRead when an unread notification is clicked", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );
      const mockToggleRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 7,
            title: "Clickable Notification",
            description: "Click me",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "sync",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: mockToggleRead,
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      const notification = await screen.findByText(
        "Clickable Notification",
        {},
        { timeout: 3000 },
      );
      const card = notification.closest('div[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      fireEvent.click(card);
      expect(mockToggleRead).toHaveBeenCalledWith(7, false);
    });

    it("calls toggleRead on Enter keydown for an unread notification", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );
      const mockToggleRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 8,
            title: "Keyboard Notification",
            description: "Press Enter",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "conflict",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: mockToggleRead,
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      const notification = await screen.findByText(
        "Keyboard Notification",
        {},
        { timeout: 3000 },
      );
      const card = notification.closest('div[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      fireEvent.keyDown(card, { key: "Enter" });
      expect(mockToggleRead).toHaveBeenCalledWith(8, false);
    });

    it("calls toggleRead on Space keydown for an unread notification", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );
      const mockToggleRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 9,
            title: "Space Key Notification",
            description: "Press Space",
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "attendance",
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: mockToggleRead,
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      const notification = await screen.findByText(
        "Space Key Notification",
        {},
        { timeout: 3000 },
      );
      const card = notification.closest('div[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      fireEvent.keyDown(card, { key: " " });
      expect(mockToggleRead).toHaveBeenCalledWith(9, false);
    });

    it("calls toggleRead when a read notification is clicked", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );
      const mockToggleRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 10,
            title: "Already Read Notification",
            description: "Already done",
            is_read: true,
            created_at: new Date().toISOString(),
            user_id: "123",
            topic: "sync",
          },
        ],
        unreadCount: 0,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
        toggleRead: mockToggleRead,
        markAllAsRead: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<NotificationsPage />);

      const notification = await screen.findByText(
        "Already Read Notification",
        {},
        { timeout: 3000 },
      );
      const card = notification.closest('div[role="button"]') as HTMLElement;
      if (card) fireEvent.click(card);
      expect(mockToggleRead).toHaveBeenCalledWith(10, true);
    });
  });

  describe("Sync Callbacks", () => {
    it("handles partial sync by showing a toast", async () => {
      const { useSyncOnMount } = await import("@/hooks/use-sync-on-mount");
      let partialSyncCallback: any;
      vi.mocked(useSyncOnMount).mockImplementation(({ onPartialSync }: any) => {
        partialSyncCallback = onPartialSync;
        return { isSyncing: false, syncSettled: true, syncFailed: false };
      });

      const { toast } = await import("sonner");
      render(<NotificationsPage />);
      await partialSyncCallback();
      expect(toast.warning).toHaveBeenCalledWith(
        "Partial Sync Completed",
        expect.any(Object),
      );
    });

    it("handles successful sync with updates by showing a toast", async () => {
      const { useSyncOnMount } = await import("@/hooks/use-sync-on-mount");
      let successCallback: any;
      vi.mocked(useSyncOnMount).mockImplementation(({ onSuccess }: any) => {
        successCallback = onSuccess;
        return { isSyncing: false, syncSettled: true, syncFailed: false };
      });

      const { toast } = await import("sonner");
      render(<NotificationsPage />);
      await successCallback({ updates: 5 });
      expect(toast.info).toHaveBeenCalledWith(
        "Notifications Updated",
        expect.any(Object),
      );
    });
  });

  describe("Handle Toggle Read Error", () => {
    it("logs error and shows toast on failure", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );
      const mockToggleRead = vi.fn().mockRejectedValue(new Error("API Error"));

      vi.mocked(useNotifications).mockReturnValue({
        ...MOCK_NOTIFICATIONS_VAL,
        regularNotifications: [
          {
            id: 11,
            title: "Error Notification",
            is_read: false,
            created_at: new Date().toISOString(),
            topic: "sync",
          },
        ],
        toggleRead: mockToggleRead,
      } as any);

      const { toast } = await import("sonner");
      const { logger } = await import("@/lib/logger");

      // Ensure NODE_ENV is development for line 213 coverage
      vi.stubEnv("NODE_ENV", "development");

      render(<NotificationsPage />);
      const notification = await screen.findByText("Error Notification");
      fireEvent.click(notification);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Could not update notification",
        );
        expect(logger.error).toHaveBeenCalled();
      });

      vi.unstubAllEnvs();
    });
  });

  describe("Empty State", () => {
    it("renders empty state when no notifications exist", async () => {
      const { useNotifications } = await import(
        "@/hooks/notifications/useNotifications"
      );
      vi.mocked(useNotifications).mockReturnValue({
        ...MOCK_NOTIFICATIONS_VAL,
        actionNotifications: [],
        regularNotifications: [],
      } as any);

      render(<NotificationsPage />);
      expect(screen.getByText("All caught up!")).toBeInTheDocument();
    });
  });
});
