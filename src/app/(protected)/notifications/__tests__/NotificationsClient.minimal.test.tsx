/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import NotificationsPage from "../NotificationsClient";

vi.mock("@/hooks/notifications/useNotifications", () => ({
  useNotifications: vi.fn(() => ({
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
  })),
}));

vi.mock("@/hooks/users/user", () => ({
  useUser: () => ({ data: { id: "123", username: "test" }, isLoading: false }),
}));

vi.mock("@/hooks/use-sync-on-mount", () => ({
    useSyncOnMount: vi.fn(() => ({
      isSyncing: false,
      syncSettled: true,
      syncFailed: false,
    })),
}));

vi.mock("@/hooks/notifications/use-notification-virtualizer", () => ({
  useNotificationVirtualizer: vi.fn(() => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  })),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe("NotificationsClient Minimal", () => {
  it("renders without hanging", () => {
    render(<NotificationsPage />);
    expect(screen.getByRole("heading", { name: /^Notifications$/i })).toBeInTheDocument();
  });
});
