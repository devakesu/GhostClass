import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../theme';
import { THEME_STORAGE_KEY } from '@/lib/theme-storage-key';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ThemeDisplay() {
  const { theme } = useTheme();
  return <div data-testid="theme-value">{theme}</div>;
}

function ThemeToggleButton() {
  const { toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>toggle</button>;
}

function ThemeSetButton({ value }: { value: 'light' | 'dark' }) {
  const { setTheme } = useTheme();
  return <button onClick={() => setTheme(value)}>set-{value}</button>;
}

function ThrowingConsumer() {
  useTheme();
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThemeProvider', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageMock[key] = value; }),
      removeItem: vi.fn((key: string) => { delete localStorageMock[key]; }),
    });
    // Reset documentElement classList
    document.documentElement.classList.remove('dark', 'light');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getInitialTheme', () => {
    it('defaults to dark when no stored preference exists', () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });

    it('reads stored "dark" preference from localStorage', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'dark';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });

    it('reads stored "light" preference from localStorage', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'light';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('light');
    });

    it('falls back to dark when stored value is invalid', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'invalid';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });

    it('falls back to dark when localStorage throws', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => { throw new Error('blocked'); }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });
  });

  describe('applyTheme', () => {
    it('adds "dark" class to documentElement when theme is dark', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'dark';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('removes "dark" class from documentElement when theme is light', () => {
      document.documentElement.classList.add('dark');
      localStorageMock[THEME_STORAGE_KEY] = 'light';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('updates meta theme-color for dark theme', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);

      localStorageMock[THEME_STORAGE_KEY] = 'dark';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(meta.getAttribute('content')).toBe('#141414');
      document.head.removeChild(meta);
    });

    it('updates meta theme-color for light theme', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);

      localStorageMock[THEME_STORAGE_KEY] = 'light';
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(meta.getAttribute('content')).toBe('#f8f8fc');
      document.head.removeChild(meta);
    });

    it('does not throw when meta[name="theme-color"] is absent', () => {
      // No meta tag in DOM — applyTheme should not throw
      expect(() => {
        render(
          <ThemeProvider>
            <ThemeDisplay />
          </ThemeProvider>
        );
      }).not.toThrow();
    });
  });

  describe('toggleTheme', () => {
    it('switches from dark to light', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'dark';
      render(
        <ThemeProvider>
          <ThemeDisplay />
          <ThemeToggleButton />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');

      fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
      expect(screen.getByTestId('theme-value').textContent).toBe('light');
    });

    it('switches from light to dark', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'light';
      render(
        <ThemeProvider>
          <ThemeDisplay />
          <ThemeToggleButton />
        </ThemeProvider>
      );
      expect(screen.getByTestId('theme-value').textContent).toBe('light');

      fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });

    it('persists toggled theme to localStorage', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'dark';
      const setItemSpy = vi.spyOn(window.localStorage, 'setItem');

      render(
        <ThemeProvider>
          <ThemeDisplay />
          <ThemeToggleButton />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
      expect(setItemSpy).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
    });
  });

  describe('setTheme', () => {
    it('sets theme to light explicitly', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'dark';
      render(
        <ThemeProvider>
          <ThemeDisplay />
          <ThemeSetButton value="light" />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'set-light' }));
      expect(screen.getByTestId('theme-value').textContent).toBe('light');
    });

    it('sets theme to dark explicitly', () => {
      localStorageMock[THEME_STORAGE_KEY] = 'light';
      render(
        <ThemeProvider>
          <ThemeDisplay />
          <ThemeSetButton value="dark" />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'set-dark' }));
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });
  });

  describe('localStorage persistence', () => {
    it('persists theme to localStorage on mount', () => {
      const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>
      );
      expect(setItemSpy).toHaveBeenCalledWith(THEME_STORAGE_KEY, expect.any(String));
    });

    it('does not throw when localStorage.setItem throws', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(() => { throw new Error('storage full'); }),
        removeItem: vi.fn(),
      });
      expect(() => {
        render(
          <ThemeProvider>
            <ThemeDisplay />
          </ThemeProvider>
        );
      }).not.toThrow();
    });
  });
});

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThrowingConsumer />)).toThrow(
      'useTheme must be used within a ThemeProvider'
    );
    consoleError.mockRestore();
  });
});
