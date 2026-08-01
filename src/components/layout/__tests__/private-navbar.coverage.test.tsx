/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Navbar } from "../private-navbar";

// Mock all required hooks
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
}));

vi.mock("nextjs-toploader", () => ({
  useTopLoader: () => ({ start: vi.fn() }),
}));

vi.mock("@/hooks/users/profile", () => ({
  useProfile: vi.fn(() => ({
    data: { id: "123", username: "testuser", email: "test@example.com" },
    isLoading: false,
  })),
}));

const mockUpdateBunkCalc = vi.fn();
const mockUpdateTarget = vi.fn();
vi.mock("@/providers/user-settings", () => ({
  useUserSettings: () => ({
    settings: { target_percentage: 75, bunk_calculator_enabled: true },
    updateBunkCalc: mockUpdateBunkCalc,
    updateTarget: mockUpdateTarget,
    isLoading: false,
  }),
}));

const mockToggleTheme = vi.fn();
vi.mock("@/providers/theme", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: mockToggleTheme,
  }),
}));

vi.mock("@/hooks/users/institutions", () => ({
  useInstitutions: () => ({
    data: [{ id: 1, institution: { name: "Test Inst" } }],
    isLoading: false,
  }),
  useDefaultInstitutionUser: () => ({ data: 1 }),
  useUpdateDefaultInstitutionUser: () => ({ mutate: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: {
      id: "123",
      username: "testuser",
      email: "test@example.com",
      avatar_url: null,
    },
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/hooks/notifications/useNotifications", () => ({
  useNotifications: () => ({ unreadCount: 5 }),
}));

vi.mock("@/lib/security/auth", () => ({
  handleLogout: vi.fn(),
}));

vi.mock("@/components/attendance/AddRecordTrigger", () => ({
  AddRecordTrigger: () => <button data-testid="add-trigger">Add</button>,
}));

vi.mock("lucide-react", () => {
  const Icon = () => <span data-testid="icon" />;
  return {
    Building2: Icon,
    Calculator: Icon,
    Contact: Icon,
    FileText: Icon,
    GraduationCap: Icon,
    HelpCircle: Icon,
    Layers2: Icon,
    LogOut: Icon,
    Moon: Icon,
    Percent: Icon,
    SquareAsterisk: Icon,
    Sun: Icon,
    UserRound: Icon,
    Bell: Icon,
  };
});

// Mock UI components
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="menu-content">{children}</div>
  ),
  DropdownMenuItem: (
    { children, onClick }: { children?: React.ReactNode; onClick?: () => void },
  ) => <button onClick={onClick}>{children}</button>,
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: (
    { children, onValueChange }: {
      children?: React.ReactNode;
      onValueChange?: (v: string) => void;
    },
  ) => (
    <div
      data-testid="select-root"
      onClick={() => onValueChange && onValueChange("80")}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button>{children}</button>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (
    { checked, onCheckedChange }: {
      checked?: boolean;
      onCheckedChange: (v: boolean) => void;
    },
  ) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("Navbar Coverage Hardening", () => {
  it("handles logout click", async () => {
    const { handleLogout } = await import("@/lib/security/auth");
    render(<Navbar />);

    const logoutBtn = screen.getByText("Log out");
    fireEvent.click(logoutBtn);
    expect(handleLogout).toHaveBeenCalled();
  });

  it("handles theme toggle", () => {
    render(<Navbar />);
    const switches = screen.getAllByRole("checkbox");
    fireEvent.click(switches[0]);
    expect(mockToggleTheme).toHaveBeenCalled();
  });

  it("handles bunk calculator toggle", () => {
    render(<Navbar />);
    const switches = screen.getAllByRole("checkbox");
    fireEvent.click(switches[1]);
    expect(mockUpdateBunkCalc).toHaveBeenCalled();
  });

  it("handles navigation clicks in menu", () => {
    render(<Navbar />);
    const trackingItems = screen.getAllByText("Tracking");
    fireEvent.click(trackingItems[0]);
    expect(mockPush).toHaveBeenCalledWith("/tracking");
  });
});
