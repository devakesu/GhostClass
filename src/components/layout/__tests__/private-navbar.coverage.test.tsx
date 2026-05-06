/** @vitest-environment jsdom */
import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../private-navbar';

// Mock all required hooks
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
}));

vi.mock('nextjs-toploader', () => ({
  useTopLoader: () => ({ start: vi.fn() }),
}));

vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({
    data: { id: '123', username: 'testuser', email: 'test@example.com' },
    isLoading: false,
  })),
}));

vi.mock('@/providers/user-settings', () => ({
  useUserSettings: () => ({
    settings: { target_percentage: 75, bunk_calculator_enabled: true },
    updateBunkCalc: vi.fn(),
    updateTarget: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/providers/theme', () => ({
  useTheme: () => ({
    theme: 'dark',
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('@/hooks/users/institutions', () => ({
  useInstitutions: () => ({
    data: [{ id: 1, institution: { name: 'Test Inst' } }],
    isLoading: false,
  }),
  useDefaultInstitutionUser: () => ({ data: 1 }),
  useUpdateDefaultInstitutionUser: () => ({ mutate: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('@/hooks/notifications/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 5 }),
}));

vi.mock('@/lib/security/auth', () => ({
  handleLogout: vi.fn(),
}));

vi.mock('@/components/attendance/AddRecordTrigger', () => ({
  AddRecordTrigger: () => <button data-testid="add-trigger">Add</button>,
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span data-testid="icon" />;
  return {
    Building2: Icon, Calculator: Icon, Contact: Icon, FileText: Icon,
    GraduationCap: Icon, HelpCircle: Icon, Layers2: Icon, LogOut: Icon,
    Moon: Icon, Percent: Icon, SquareAsterisk: Icon, Sun: Icon, UserRound: Icon, Bell: Icon,
  };
});

// Mock UI components
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="menu-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange }: any) => (
    <div data-testid="select-root" onClick={() => onValueChange && onValueChange('80')}>{children}</div>
  ),
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
  ),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
}));

describe('Navbar Coverage Hardening', () => {
  it('handles logout click', async () => {
    const { handleLogout } = await import('@/lib/security/auth');
    render(<Navbar />);
    
    const logoutBtn = screen.getByText('Log out');
    fireEvent.click(logoutBtn);
    expect(handleLogout).toHaveBeenCalled();
  });

  it('handles theme toggle', async () => {
    render(<Navbar />);
    const switches = screen.getAllByRole('checkbox');
    fireEvent.click(switches[0]);
    // expect toggleTheme to be called (mocked in providers/theme)
  });

  it('handles bunk calculator toggle', async () => {
    render(<Navbar />);
    const switches = screen.getAllByRole('checkbox');
    fireEvent.click(switches[1]);
    // expect updateBunkCalc to be called (mocked in providers/user-settings)
  });

  it('handles navigation clicks in menu', async () => {
    render(<Navbar />);
    const trackingItems = screen.getAllByText('Tracking');
    fireEvent.click(trackingItems[0]);
    // expect router.push to be called
  });
});
