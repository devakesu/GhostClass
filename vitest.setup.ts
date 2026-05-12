import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import React from 'react'

// Mock server-only
vi.mock('server-only', () => ({}))

// Setup environment variables before each test
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  vi.stubEnv('NEXT_PUBLIC_APP_DOMAIN', 'localhost')
  vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', '@test.com')
})

// Cleanup after each test
afterEach(() => {
  cleanup()
  // Restore real timers FIRST — before restoreAllMocks() — so that any mock
  // wrapping timer globals is torn down while the fake-timer system is still
  // coherent. Reversing this order can leave Vitest's fake-timer bookkeeping
  // in a corrupt state and cause the next test's imports / async ops to hang.
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (typeof window !== 'undefined') {
    localStorage.clear()
    sessionStorage.clear()
  }
})

// Mock window.matchMedia (not available in jsdom)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// Mock ResizeObserver
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// Mock Next.js Image
vi.mock('next/image', () => ({
  default: ({ alt, fill: _fill, priority: _priority, placeholder: _placeholder, blurDataURL: _blurDataURL, ...props }: any) => {
    return React.createElement('img', { alt, ...props })
  },
}))

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  })),
}))

// Mock CircuitBreaker to prevent interference with unit tests
vi.mock('@/lib/circuit-breaker', () => {
  class MockCircuitBreaker {
    async execute(fn: any) { return await fn(); }
    on() {}
    getState() { return 'CLOSED'; }
    getStatus() { return { state: 'CLOSED', failures: 0, timeUntilReset: 0, successCount: 0, isOpen: false }; }
    reset() {}
  }
  return {
    CircuitBreaker: MockCircuitBreaker,
    ezygoCircuitBreaker: new MockCircuitBreaker(),
    CircuitBreakerOpenError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
      }
    },
    NonBreakerError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'NonBreakerError';
      }
    },
    UpstreamServerError: class extends Error {
      constructor(
        message: string,
        public readonly status: number,
        public readonly statusText?: string,
        public readonly body?: string,
        public readonly headers?: Headers,
      ) {
        super(message);
        this.name = 'UpstreamServerError';
      }
    },
  };
});

// Mock Loading component
vi.mock('@/components/loading', async () => {
  const React = await import('react');
  return {
    Loading: ({ minimal, message }: any) => {
      return React.createElement('div', { 'data-testid': 'loading-spinner' },
        minimal ? 'Minimal Loading...' : 'Full Loading...',
        message ? React.createElement('span', null, message) : null
      );
    },
  };
});


// Mock hooks
vi.mock('@/hooks/tracker/useTrackingData', () => ({
  useTrackingData: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({ data: [], isLoading: false, error: null }),
  })),
}));

vi.mock('@/hooks/tracker/useTrackingCount', () => ({
  useTrackingCount: vi.fn(() => ({
    data: 0,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue({ data: 0, isLoading: false }),
  })),
}));

vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({
    data: { 
      id: '123', 
      email: 'test@example.com', 
      username: 'testuser',
      class: { id: 'class-123', name: 'Test Class' }
    },
    isLoading: false,
  })),
  useUpdateProfile: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/hooks/users/user', () => ({
  useUser: () => ({
    data: { id: '123', email: 'test@example.com', username: 'testuser' },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/attendance', () => ({
  useAttendanceReport: () => ({
    data: null,
    isLoading: false,
  }),
  useCourseDetails: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
  useAllCourseDetails: vi.fn(() => ({
    data: {},
    isLoading: false,
  })),
}));

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: () => ({
    data: 'even',
    isLoading: false,
  }),
  useFetchAcademicYear: () => ({
    data: '2024-25',
    isLoading: false,
  }),
  useSetSemester: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useSetAcademicYear: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useFetchUserSettings: vi.fn(() => ({
    data: { semester: 'even', academicYear: '2024-25' },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/courses/courses', () => ({
  useFetchCourses: () => ({
    data: { courses: {} },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/courses/useDisabledCourses', () => ({
  useDisabledCourses: vi.fn(() => ({
    disabledCoursesMap: {},
    disabledCodes: new Set<string>(),
    isDisabled: vi.fn(() => false),
    getDisableReason: vi.fn(() => null),
    disableCourse: vi.fn(),
    enableCourse: vi.fn(),
    isLoading: false,
  })),
  makeSemesterKey: vi.fn((sem, year) => `${sem}-${year}`),
}));

vi.mock('@/hooks/use-sync-on-mount', () => ({
  useSyncOnMount: vi.fn(() => ({
    isSyncing: false,
    syncCompleted: true,
  })),
}));

vi.mock('@/hooks/courses/useFetchClassCourses', () => ({
  useFetchClassCourses: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
}));

vi.mock('@/hooks/use-build-info', () => ({
  useBuildInfo: () => ({
    data: {
      version: '1.0.0',
      branch: 'main',
      commit: 'test-commit',
      isLegacy: false,
    },
    isLoading: false,
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => {
  const MockDiv = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('div', { ref, ...props }, children));
  MockDiv.displayName = 'MotionDiv';
  
  const MockButton = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('button', { ref, ...props }, children));
  MockButton.displayName = 'MotionButton';
  
  const MockP = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('p', { ref, ...props }, children));
  MockP.displayName = 'MotionP';
  
  const MockSpan = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('span', { ref, ...props }, children));
  MockSpan.displayName = 'MotionSpan';
  
  const MockSection = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('section', { ref, ...props }, children));
  MockSection.displayName = 'MotionSection';
  
  const MockNav = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('nav', { ref, ...props }, children));
  MockNav.displayName = 'MotionNav';
  
  const MockHeader = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('header', { ref, ...props }, children));
  MockHeader.displayName = 'MotionHeader';
  
  const MockFooter = React.forwardRef(({ children, ...props }: any, ref: any) => React.createElement('footer', { ref, ...props }, children));
  MockFooter.displayName = 'MotionFooter';

  return {
    LazyMotion: ({ children }: any) => children,
    domAnimation: {},
    m: {
      div: MockDiv,
      button: MockButton,
      p: MockP,
      span: MockSpan,
      section: MockSection,
      nav: MockNav,
      header: MockHeader,
      footer: MockFooter,
    },
    AnimatePresence: ({ children }: any) => children,
    motion: {
      div: MockDiv,
      button: MockButton,
      p: MockP,
      span: MockSpan,
      section: MockSection,
      nav: MockNav,
      header: MockHeader,
      footer: MockFooter,
    },
  };
});

// Mock lucide-react icons globally
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal() as any;
  const mockIcon = (name: string) => {
    const Icon = (props: any) => React.createElement('div', { ...props, 'data-testid': `icon-${name.toLowerCase()}` });
    Icon.displayName = name;
    return Icon;
  };

  const mocks: any = {};
  Object.keys(actual).forEach(key => {
    if (typeof actual[key] === 'function' || (actual[key] && actual[key].$$typeof)) {
      mocks[key] = mockIcon(key);
    }
  });

  // Ensure common ones are there even if not in keys
  const commonIcons = [
    'AlertTriangle', 'AlertCircle', 'Bell', 'Check', 'CheckCircle2', 
    'ChevronLeft', 'ChevronRight', 'Clock', 'FileText', 'Filter', 
    'GraduationCap', 'HelpCircle', 'Info', 'Loader2', 'LogOut', 
    'MoreVertical', 'Plus', 'RefreshCcw', 'RefreshCw', 'Search', 
    'Settings', 'Trash2', 'User', 'X', 'BookOpen', 'CalendarClock'
  ];
  
  commonIcons.forEach(icon => {
    if (!mocks[icon]) mocks[icon] = mockIcon(icon);
  });

  return mocks;
});







