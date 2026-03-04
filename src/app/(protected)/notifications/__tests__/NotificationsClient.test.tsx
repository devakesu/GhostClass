import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NotificationsPage from '../NotificationsClient';

// Mock all required hooks and dependencies
vi.mock('@/hooks/notifications/useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    actionNotifications: [],
    regularNotifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 100,
    getVirtualItems: () => [
      {
        key: 0,
        index: 0,
        size: 50,
        start: 0,
        end: 50,
        measureElement: vi.fn(),
      },
      {
        key: 1,
        index: 1,
        size: 50,
        start: 50,
        end: 100,
        measureElement: vi.fn(),
      },
    ],
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
    measure: vi.fn(),
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

describe('NotificationsClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('CSS Hover Effects (Line 47)', () => {
    it('should apply hover:shadow-md class to unread notifications', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      
      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 1,
            title: 'Test Notification',
            description: 'Test description',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'sync',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
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
        expect(screen.queryByText('Test Notification')).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        const notification = screen.getByText('Test Notification').closest('div[role="button"]');
        expect(notification).toBeInTheDocument();
        // Verify the hover:shadow-md class is present
        expect(notification?.className).toContain('hover:shadow-md');
      });
    });

    it('should not apply hover:shadow-md class to read notifications', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      
      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 1,
            title: 'Read Notification',
            description: 'Test description',
            is_read: true,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'sync',
          },
        ],
        unreadCount: 0,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
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
        expect(screen.queryByText('Read Notification')).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        const notification = screen.getByText('Read Notification').closest('div[role="button"]');
        expect(notification).toBeInTheDocument();
        // Read notifications should not have hover:shadow-md
        expect(notification?.className).not.toContain('hover:shadow-md');
      });
    });

    it('should apply cursor-pointer class for unread notifications', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      
      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 1,
            title: 'Unread Notification',
            description: 'Test description',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'attendance',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
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
        expect(screen.queryByText('Unread Notification')).toBeInTheDocument();
      }, { timeout: 3000 });

      await waitFor(() => {
        const notification = screen.getByText('Unread Notification').closest('div[role="button"]');
        expect(notification).toBeInTheDocument();
        expect(notification?.className).toContain('cursor-pointer');
      });
    });
  });

  describe('getNotificationIcon – default (unknown topic)', () => {
    it('renders an unread notification with an unknown topic without crashing', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 5,
            title: 'Unknown Topic Notification',
            description: 'No topic match',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'random-unknown-topic',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
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
        expect(screen.queryByText('Unknown Topic Notification')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('renders an unread notification with no topic at all without crashing', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 6,
            title: 'No Topic Notification',
            description: 'topic is undefined',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: vi.fn(),
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
        expect(screen.queryByText('No Topic Notification')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Notification click and keyboard interaction', () => {
    it('calls markAsRead when an unread notification is clicked', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      const mockMarkAsRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 7,
            title: 'Clickable Notification',
            description: 'Click me',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'sync',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: mockMarkAsRead,
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

      const notification = await screen.findByText('Clickable Notification', {}, { timeout: 3000 });
      const card = notification.closest('div[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      fireEvent.click(card);
      expect(mockMarkAsRead).toHaveBeenCalledWith(7);
    });

    it('calls markAsRead on Enter keydown for an unread notification', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      const mockMarkAsRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 8,
            title: 'Keyboard Notification',
            description: 'Press Enter',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'conflict',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: mockMarkAsRead,
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

      const notification = await screen.findByText('Keyboard Notification', {}, { timeout: 3000 });
      const card = notification.closest('div[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(mockMarkAsRead).toHaveBeenCalledWith(8);
    });

    it('calls markAsRead on Space keydown for an unread notification', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      const mockMarkAsRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 9,
            title: 'Space Key Notification',
            description: 'Press Space',
            is_read: false,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'attendance',
          },
        ],
        unreadCount: 1,
        isLoading: false,
        error: null,
        markAsRead: mockMarkAsRead,
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

      const notification = await screen.findByText('Space Key Notification', {}, { timeout: 3000 });
      const card = notification.closest('div[role="button"]') as HTMLElement;
      expect(card).toBeInTheDocument();

      fireEvent.keyDown(card, { key: ' ' });
      expect(mockMarkAsRead).toHaveBeenCalledWith(9);
    });

    it('does not call markAsRead when a read notification is clicked', async () => {
      const { useNotifications } = await import('@/hooks/notifications/useNotifications');
      const mockMarkAsRead = vi.fn();

      vi.mocked(useNotifications).mockReturnValue({
        actionNotifications: [],
        regularNotifications: [
          {
            id: 10,
            title: 'Already Read Notification',
            description: 'Already done',
            is_read: true,
            created_at: new Date().toISOString(),
            user_id: '123',
            topic: 'sync',
          },
        ],
        unreadCount: 0,
        isLoading: false,
        error: null,
        markAsRead: mockMarkAsRead,
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

      const notification = await screen.findByText('Already Read Notification', {}, { timeout: 3000 });
      const card = notification.closest('div[role="button"]') as HTMLElement;
      if (card) fireEvent.click(card);
      expect(mockMarkAsRead).not.toHaveBeenCalled();
    });
  });
});
