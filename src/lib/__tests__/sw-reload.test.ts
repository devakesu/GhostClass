import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SW Reload', () => {
  const originalLocation = window.location;
  const originalServiceWorker = navigator.serviceWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock window.location.reload
    // @ts-expect-error - test-only: mocking ServiceWorker global state
    delete window.location;
     (window as any).location = { ...originalLocation, reload: vi.fn() } as any;

    // Mock navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      writable: true,
      configurable: true,
      value: {
        getRegistration: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
     (window as any).location = originalLocation;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      configurable: true,
      writable: true
    });
  });

  it('reloads normally if service worker is not supported', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
    });
    
    const { reloadWithUpdate } = await import('../sw-reload');
    reloadWithUpdate();
    
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('reloads normally if no waiting worker', async () => {
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue({
      waiting: null,
    } as any);

    const { reloadWithUpdate } = await import('../sw-reload');
    reloadWithUpdate();
    
    // Wait for async task
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('sends SKIP_WAITING and reloads when worker is waiting', async () => {
    const mockWaitingWorker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      state: 'installed',
    };

    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue({
      waiting: mockWaitingWorker,
    } as any);

    const { reloadWithUpdate } = await import('../sw-reload');
    reloadWithUpdate();
    
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(mockWaitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    
    // Simulate statechange to activated
    const stateChangeHandler = vi.mocked(mockWaitingWorker.addEventListener).mock.calls.find(call => call[0] === 'statechange')?.[1] as any;
    if (stateChangeHandler) {
      (mockWaitingWorker as any).state = 'activated';
      stateChangeHandler();
    }
    
    expect(window.location.reload).toHaveBeenCalled();
  });

  describe('tryAutoUpdate', () => {
    const originalSessionStorage = global.sessionStorage;

    beforeEach(() => {
      // Mock sessionStorage
      const mockStorage: Record<string, string> = {};
      Object.defineProperty(global, 'sessionStorage', {
        value: {
          getItem: vi.fn(key => mockStorage[key] || null),
          setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
          removeItem: vi.fn(key => { delete mockStorage[key]; }),
          clear: vi.fn(() => { for (const key in mockStorage) delete mockStorage[key]; }),
          length: 0,
          key: vi.fn(),
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, 'sessionStorage', {
        value: originalSessionStorage,
        configurable: true,
      });
    });

    it('does nothing if service worker is not supported', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
      });
      // @ts-expect-error - test-only: mocking ServiceWorker global state
      delete navigator.serviceWorker;

      const { tryAutoUpdate } = await import('../sw-reload');
      tryAutoUpdate();
      expect(navigator.serviceWorker).toBeUndefined();
    });

    it('does nothing if already attempted in this session', async () => {
      sessionStorage.setItem('sw-auto-reload-attempted', '1');
      
      const { tryAutoUpdate } = await import('../sw-reload');
      tryAutoUpdate();
      
      expect(navigator.serviceWorker.getRegistration).not.toHaveBeenCalled();
    });

    it('bails out if no waiting worker', async () => {
      vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue({
        waiting: null,
      } as any);

      const { tryAutoUpdate } = await import('../sw-reload');
      tryAutoUpdate();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(sessionStorage.getItem('sw-auto-reload-attempted')).toBeNull();
    });

    it('sets guard and activates worker when update is waiting', async () => {
      const mockWaitingWorker = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        state: 'installed',
      };

      vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue({
        waiting: mockWaitingWorker,
      } as any);

      const { tryAutoUpdate } = await import('../sw-reload');
      tryAutoUpdate();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(sessionStorage.getItem('sw-auto-reload-attempted')).toBe('1');
      expect(mockWaitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('handles sessionStorage access errors gracefully', async () => {
      vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
        throw new Error('Access denied');
      });

      const { tryAutoUpdate } = await import('../sw-reload');
      tryAutoUpdate();
      
      expect(navigator.serviceWorker.getRegistration).not.toHaveBeenCalled();
    });

    it('handles registration errors gracefully', async () => {
      vi.mocked(navigator.serviceWorker.getRegistration).mockRejectedValue(new Error('Reg fail'));

      const { tryAutoUpdate } = await import('../sw-reload');
      tryAutoUpdate();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      // Should not throw, just bail out
      expect(sessionStorage.getItem('sw-auto-reload-attempted')).toBeNull();
    });
  });
});
