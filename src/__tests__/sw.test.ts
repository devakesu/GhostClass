import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Serwist
vi.mock('serwist', () => {
  return {
    Serwist: vi.fn().mockImplementation(function() {
      return { addEventListeners: vi.fn() };
    }),
    CacheFirst: vi.fn(),
    NetworkOnly: vi.fn(),
    StaleWhileRevalidate: vi.fn(),
    CacheableResponsePlugin: vi.fn(),
    ExpirationPlugin: vi.fn(),
  };
});

type Listener = (event: unknown) => unknown;

type MockClients = {
  get: ReturnType<typeof vi.fn>;
};

type MockSelf = {
  addEventListener: ReturnType<typeof vi.fn>;
  skipWaiting: ReturnType<typeof vi.fn>;
  location: { origin: string };
  clients: MockClients;
  caches: { delete: ReturnType<typeof vi.fn> };
  __SW_MANIFEST: [];
};

describe('Service Worker', () => {
  let fetchHandler: Listener | undefined;
  let activateHandler: Listener | undefined;
  let messageHandler: Listener | undefined;
  let mockSelf: MockSelf;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock ServiceWorkerGlobalScope
    const listeners = new Map<string, Listener[]>();
    mockSelf = {
      addEventListener: vi.fn((type: string, handler: Listener) => {
        const handlers = listeners.get(type) ?? [];
        handlers.push(handler);
        listeners.set(type, handlers);
      }),
      skipWaiting: vi.fn(),
      location: { origin: 'https://example.com' },
      clients: {
        get: vi.fn(),
      },
      caches: {
        delete: vi.fn().mockResolvedValue(true),
      },
      __SW_MANIFEST: [],
    };

    vi.stubGlobal('self', mockSelf);
    vi.stubGlobal('caches', mockSelf.caches);

    // Import the SW file
    await import('../sw');

    fetchHandler = listeners.get('fetch')?.[0];
    activateHandler = listeners.get('activate')?.[1] || listeners.get('activate')?.[0]; // activate listener
    messageHandler = listeners.get('message')?.[0];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Fetch Event', () => {
    it('bypasses SW for navigation requests', () => {
      const event = {
        request: { mode: 'navigate', url: 'https://example.com/page' },
        stopImmediatePropagation: vi.fn(),
        respondWith: vi.fn(),
      };
      fetchHandler!(event);
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
      expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('bypasses SW for /monitoring and /api/ routes', () => {
      const monitoringEvent = {
        request: { url: 'https://example.com/monitoring/collect' },
        stopImmediatePropagation: vi.fn(),
        respondWith: vi.fn(),
      };
      fetchHandler!(monitoringEvent);
      expect(monitoringEvent.stopImmediatePropagation).toHaveBeenCalled();

      const apiEvent = {
        request: { url: 'https://example.com/api/user' },
        stopImmediatePropagation: vi.fn(),
        respondWith: vi.fn(),
      };
      fetchHandler!(apiEvent);
      expect(apiEvent.stopImmediatePropagation).toHaveBeenCalled();
    });

    it('lets other requests pass through to Serwist', () => {
      const staticEvent = {
        request: { mode: 'no-cors', url: 'https://example.com/static/style.css' },
        stopImmediatePropagation: vi.fn(),
        respondWith: vi.fn(),
      };
      fetchHandler!(staticEvent);
      expect(staticEvent.stopImmediatePropagation).not.toHaveBeenCalled();
    });
  });

  describe('Activate Event', () => {
    it('purges deprecated caches', async () => {
      const event = {
        waitUntil: vi.fn((p) => p),
      };
      await activateHandler!(event);
      expect(mockSelf.caches.delete).toHaveBeenCalledWith('attendance-data');
      expect(mockSelf.caches.delete).toHaveBeenCalledWith('pages');
    });
  });

  describe('Message Event', () => {
    it('handles SKIP_WAITING message correctly', async () => {
      const event = {
        data: { type: 'SKIP_WAITING' },
        source: { id: 'client-1' },
      };

      mockSelf.clients.get.mockResolvedValue({
        url: 'https://example.com/dashboard',
      });

      await messageHandler!(event);
      
      expect(mockSelf.clients.get).toHaveBeenCalledWith('client-1');
      expect(mockSelf.skipWaiting).toHaveBeenCalled();
    });

    it('ignores SKIP_WAITING from cross-origin sources', async () => {
      const event = {
        data: { type: 'SKIP_WAITING' },
        source: { id: 'client-1' },
      };

      mockSelf.clients.get.mockResolvedValue({
        url: 'https://malicious.com/attack',
      });

      await messageHandler!(event);
      
      expect(mockSelf.skipWaiting).not.toHaveBeenCalled();
    });

    it('ignores other message types', async () => {
      const event = {
        data: { type: 'OTHER' },
      };
      await messageHandler!(event);
      expect(mockSelf.skipWaiting).not.toHaveBeenCalled();
    });
  });
});
