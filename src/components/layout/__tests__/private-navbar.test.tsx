import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useProfile } from "@/hooks/users/profile";
import { useUserSettings } from "@/providers/user-settings";
import { useInstitutions, useUpdateDefaultInstitutionUser, useDefaultInstitutionUser } from "@/hooks/users/institutions";
import { useTheme } from "@/providers/theme";
import { handleLogout } from "@/lib/security/auth";
import { isValidAvatarUrl } from "@/lib/utils";
import { Navbar } from "../private-navbar";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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

vi.mock("@/hooks/users/profile", () => ({
  useProfile: vi.fn(),
}));

vi.mock("@/providers/user-settings", () => ({
  useUserSettings: vi.fn(),
}));

vi.mock("@/hooks/users/institutions", () => ({
  useInstitutions: vi.fn(),
  useDefaultInstitutionUser: vi.fn(),
  useUpdateDefaultInstitutionUser: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(),
}));

vi.mock("@/lib/security/auth", () => ({
  handleLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/notifications/useNotifications", () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, isValidAvatarUrl: vi.fn() };
});

vi.mock("nextjs-toploader", () => ({
  useTopLoader: () => ({ start: vi.fn(), done: vi.fn() }),
}));

vi.mock("@/components/attendance/AddRecordTrigger", () => ({
  AddRecordTrigger: ({ onSuccess }: any) => (
    <div data-testid="add-record-trigger" onClick={onSuccess}>Add</div>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/providers/theme", () => ({
  useTheme: vi.fn(),
}));

// Mock UI components to simplify testing
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, "aria-label": ariaLabel, id, "aria-labelledby": ariaLabelledBy }: any) => (
    <input 
      type="checkbox" 
      id={id}
      checked={checked} 
      onChange={(e) => onCheckedChange(e.target.checked)} 
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div 
      data-testid="select-root" 
      data-value={value} 
      onClick={(e) => {
        e.stopPropagation();
        if (onValueChange) onValueChange("80");
      }}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children, "aria-label": ariaLabel, id }: any) => <button id={id} aria-label={ariaLabel}>{children}</button>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

// Mock DropdownMenu to render children directly
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <div onClick={onClick} role="menuitem">{children}</div>
  ),
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

describe("Navbar", () => {
  const mockUpdateBunkCalc = vi.fn();
  const mockUpdateTarget = vi.fn();
  const mockToggleTheme = vi.fn();
  const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/dashboard");
    
    vi.mocked(useProfile).mockReturnValue({ 
      data: { username: "testuser", email: "test@example.com", avatar_url: null }, 
      isLoading: false 
    } as any);
    
    vi.mocked(useUserSettings).mockReturnValue({
      settings: { bunk_calculator_enabled: true, target_percentage: 75 },
      updateBunkCalc: mockUpdateBunkCalc,
      updateTarget: mockUpdateTarget,
      isLoading: false,
    } as any);
    
    vi.mocked(useInstitutions).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useDefaultInstitutionUser).mockReturnValue({ data: null } as any);
    vi.mocked(useUpdateDefaultInstitutionUser).mockReturnValue({ mutate: vi.fn() } as any);
    vi.mocked(useTheme).mockReturnValue({ theme: "dark", toggleTheme: mockToggleTheme } as any);
    vi.mocked(isValidAvatarUrl).mockReturnValue(false);
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: mockInvalidateQueries } as any);
  });

  it("renders without crashing", () => {
    render(<Navbar />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("navigates to various pages from user menu", () => {
    const menuItems = [
      { text: "Dashboard", path: "/dashboard" },
      { text: "Tracking", path: "/tracking" },
      { text: "Scores", path: "/scores" },
      { text: "Leave Applications", path: "/leave-applications" },
      { text: "Profile", path: "/profile" },
      { text: "Help & FAQ", path: "/help" },
      { text: "Contact Us", path: "/contact" },
    ];

    menuItems.forEach(({ text, path }) => {
      vi.clearAllMocks();
      mockPathname.mockReturnValue("/other");
      render(<Navbar />);
      const items = screen.getAllByRole("menuitem");
      const targetItem = items.find(item => item.textContent?.includes(text));
      if (targetItem) {
        fireEvent.click(targetItem);
        expect(mockRouterPush).toHaveBeenCalledWith(path);
      }
    });
  });

  it("calls updateBunkCalc when bunk calculator toggle is changed", () => {
    render(<Navbar />);
    const bunkToggle = screen.getByLabelText("Toggle bunk calculator feature");
    
    // Toggle to false
    fireEvent.click(bunkToggle);
    expect(mockUpdateBunkCalc).toHaveBeenCalledWith(false);
    expect(toast.warning).toHaveBeenCalledWith("Bunk Calculator Disabled");
    
    // Toggle to true
    vi.mocked(useUserSettings).mockReturnValue({
      settings: { bunk_calculator_enabled: false },
      updateBunkCalc: mockUpdateBunkCalc,
    } as any);
    render(<Navbar />);
    const newToggle = screen.getAllByLabelText("Toggle bunk calculator feature")[1];
    fireEvent.click(newToggle);
    expect(toast.success).toHaveBeenCalledWith("Bunk Calculator Enabled");
  });

  it("calls handleLogout when logout is clicked", async () => {
    render(<Navbar />);
    const logoutBtn = screen.getByText("Log out");
    fireEvent.click(logoutBtn);
    expect(handleLogout).toHaveBeenCalled();
  });

  it("calls updateTarget when attendance target is changed (desktop and mobile)", () => {
    render(<Navbar />);
    const targetSelects = screen.getAllByTestId("select-root");
    
    // Desktop
    fireEvent.click(targetSelects[0]);
    expect(mockUpdateTarget).toHaveBeenCalledWith(80);
    expect(toast.success).toHaveBeenCalledWith("Attendance Target Updated", expect.anything());
    
    // Mobile
    fireEvent.click(targetSelects[1]);
    expect(mockUpdateTarget).toHaveBeenCalledWith(80);
  });

  it("calls toggleTheme when theme switch is clicked", () => {
    render(<Navbar />);
    const themeSwitch = screen.getByLabelText("Dark Mode");
    fireEvent.click(themeSwitch);
    expect(mockToggleTheme).toHaveBeenCalled();
  });

  it("renders avatar image if URL is valid", () => {
    vi.mocked(isValidAvatarUrl).mockReturnValue(true);
    vi.mocked(useProfile).mockReturnValue({ 
      data: { avatar_url: "http://example.com/avatar.png", username: "testuser" },
      isLoading: false 
    } as any);
    
    render(<Navbar />);
    const avatarImg = screen.getByAltText(/testuser profile picture/i);
    expect(avatarImg).toBeInTheDocument();
  });

  it("calls handleInstitutionChange and handles success/error", () => {
    const mutate = vi.fn((val, options) => {
      if (options.onSuccess) options.onSuccess();
      if (options.onError) options.onError();
    });
    vi.mocked(useUpdateDefaultInstitutionUser).mockReturnValue({ mutate } as any);
    vi.mocked(useInstitutions).mockReturnValue({ 
      data: [{ id: 1, institution: { name: "Inst 1" } }], 
      isLoading: false 
    } as any);
    
    render(<Navbar />);
    const selects = screen.getAllByTestId("select-root");
    fireEvent.click(selects[1]); 
    expect(mutate).toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Institution updated", expect.anything());
    expect(toast.error).toHaveBeenCalled();
  });

  it("triggers handleAddSuccess when AddRecordTrigger succeeds", async () => {
    render(<Navbar />);
    const addBtn = screen.getByTestId("add-record-trigger");
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["attendance-report"] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["track_data"] });
    });
  });

  it("renders standalone nav buttons on other pages", () => {
    mockPathname.mockReturnValue("/profile");
    render(<Navbar />);
    const trackingBtn = screen.getByRole("button", { name: /Tracking/i });
    fireEvent.click(trackingBtn);
    expect(mockRouterPush).toHaveBeenCalledWith("/tracking");
    
    const scoresBtn = screen.getByRole("button", { name: /Scores/i });
    fireEvent.click(scoresBtn);
    expect(mockRouterPush).toHaveBeenCalledWith("/scores");
  });
});
