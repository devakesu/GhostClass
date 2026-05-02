/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardClient from "../DashboardClient";
import { AttendanceSettingsProvider } from "@/providers/attendance-settings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

// Mocking heavy dependencies
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
  },
  domAnimation: {},
  LazyMotion: ({ children }: any) => children,
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  }
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="dynamic-component">Dynamic Component</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dev: vi.fn(),
  },
}));

// Mock hooks
vi.mock("@/hooks/users/profile", () => ({
  useProfile: () => ({
    data: { id: "1", username: "testuser", first_name: "Test" },
    isLoading: false,
  }),
}));

vi.mock("@/providers/user-settings", () => ({
  useUserSettings: () => ({
    settings: { target_percentage: 75, bunk_calculator_enabled: true, disabled_courses: {} },
    updateTarget: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/courses/attendance", () => ({
  useAllCourseDetails: () => ({ data: [], isLoading: false }),
  useAttendanceReport: () => ({ data: { studentAttendanceData: {} }, isLoading: false }),
}));

vi.mock("@/hooks/courses/courses", () => ({
  useFetchCourses: () => ({ data: { courses: {} }, isLoading: false }),
}));

vi.mock("@/hooks/users/settings", () => ({
  useFetchUserSettings: () => ({ data: { semester: "even", academicYear: "2024-25" }, isLoading: false }),
  useSetAcademicYear: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetSemester: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/tracker/useTrackingData", () => ({
  useTrackingData: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/courses/instructors", () => ({
  useFetchCourseInstructors: () => ({ data: [] }),
}));

vi.mock("@/hooks/courses/useFetchClassCourses", () => ({
  useFetchClassCourses: () => ({ data: [] }),
}));

vi.mock("@/hooks/courses/useDisabledCourses", () => ({
  useDisabledCourses: () => ({ disabledCodes: new Set() }),
}));

vi.mock("@/hooks/courses/useCourseLookup", () => ({
  useCourseLookup: () => ({ getCourseCodeById: (id: string) => id }),
}));

vi.mock("@/hooks/use-sync-on-mount", () => ({
  useSyncOnMount: () => ({ syncCompleted: true, isSyncing: false }),
}));

describe("DashboardClient", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  it("renders the dashboard without crashing", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AttendanceSettingsProvider>
          <DashboardClient />
        </AttendanceSettingsProvider>
      </QueryClientProvider>
    );

    // Basic assertions to ensure some content is rendered
    expect(screen.getByText(/Semester/i)).toBeDefined();
    expect(screen.getByText(/Academic Year/i)).toBeDefined();
  });

  it("handles serverError prop by showing toast", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AttendanceSettingsProvider>
          <DashboardClient serverError="500 Internal Server Error" />
        </AttendanceSettingsProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Dashboard Pre-fetch Failed"),
        expect.anything()
      );
    });
  });
});
