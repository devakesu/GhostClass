import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();
const mockPathname = vi.fn().mockReturnValue("/dashboard");

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/hooks/users/user", () => ({
  useUser: () => ({ data: { username: "testuser", email: "test@example.com" }, isLoading: false }),
}));

vi.mock("@/hooks/users/profile", () => ({
  useProfile: () => ({ data: { avatar_url: null }, isLoading: false }),
}));

vi.mock("@/providers/user-settings", () => ({
  useUserSettings: () => ({
    settings: { bunk_calculator_enabled: true, target_percentage: 75 },
    updateBunkCalc: vi.fn(),
    updateTarget: vi.fn(),
    isLoading: false,
  }),
  DEFAULT_TARGET_PERCENTAGE: 75,
}));

vi.mock("@/hooks/users/institutions", () => ({
  useInstitutions: () => ({ data: [], isLoading: false }),
  useDefaultInstitutionUser: () => ({ data: null }),
  useUpdateDefaultInstitutionUser: () => ({ mutate: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/lib/security/auth", () => ({
  handleLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/notifications/useNotifications", () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, isValidAvatarUrl: vi.fn().mockReturnValue(false) };
});

vi.mock("nextjs-toploader", () => ({
  useTopLoader: () => ({ start: vi.fn(), done: vi.fn() }),
}));

vi.mock("@/components/attendance/AddRecordTrigger", () => ({
  AddRecordTrigger: () => React.createElement("div", { "data-testid": "add-record-trigger" }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
}));

// Radix UI DropdownMenu: mock to render children directly so menu items are always visible
vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Trigger: ({ children }: { children?: React.ReactNode; asChild?: boolean }) =>
    React.createElement(React.Fragment, null, children),
  Portal: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Content: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    React.createElement("div", { role: "menu", className }, children),
  Item: ({
    children,
    onClick,
    className,
    role,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    role?: string;
    variant?: string;
  }) =>
    React.createElement("div", { role: role ?? "menuitem", onClick, className }, children),
  Label: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  Separator: () => React.createElement("hr"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

vi.mock("@/providers/theme", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn(), setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

import { Navbar } from "../private-navbar";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/dashboard");
  });

  it("renders without crashing", () => {
    render(<Navbar />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders all six dropdown menu items", () => {
    render(<Navbar />);
    // Use getAllByRole to get all menuitem elements in the dropdown
    const menuItems = screen.getAllByRole("menuitem");
    const menuItemTexts = menuItems.map((item) => item.textContent?.trim() ?? "");
    expect(menuItemTexts).toEqual(
      expect.arrayContaining(["Dashboard", "Tracking", "Scores", "Profile", "Help & FAQ", "Contact Us"])
    );
  });

  it("renders the user menu items with correct roles", () => {
    render(<Navbar />);
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.length).toBeGreaterThanOrEqual(6);
  });

  it("calls router.push when a menu item is clicked", () => {
    mockPathname.mockReturnValue("/tracking");
    render(<Navbar />);
    // Find the Dashboard menu item in the dropdown and click it
    const menuItems = screen.getAllByRole("menuitem");
    const dashboardItem = menuItems.find((item) => item.textContent?.includes("Dashboard"));
    expect(dashboardItem).toBeDefined();
    fireEvent.click(dashboardItem!);
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the username in the dropdown label", () => {
    render(<Navbar />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("renders the bunk calculator toggle", () => {
    render(<Navbar />);
    expect(screen.getByLabelText("Toggle bunk calculator feature")).toBeInTheDocument();
  });

  it("renders the notifications button", () => {
    render(<Navbar />);
    expect(screen.getByLabelText("Notifications: No unread messages")).toBeInTheDocument();
  });

  it("does not show dashboard nav button when already on /dashboard", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<Navbar />);
    // The main nav button (outside dropdown) should not be visible on /dashboard
    // (it's hidden with max-lg:hidden), but the dropdown item IS shown
    const buttons = screen.queryAllByRole("button", { name: /Dashboard/i });
    // There should be no standalone nav button for dashboard on the /dashboard page
    const navButtons = buttons.filter(
      (btn) => !btn.closest("[role='menu']") && !btn.closest("[role='menuitem']")
    );
    expect(navButtons.length).toBe(0);
  });
});
