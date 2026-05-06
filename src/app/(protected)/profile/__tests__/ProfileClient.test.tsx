import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ProfileClient from '../ProfileClient';
import { useProfile } from '@/hooks/users/profile';
import { uploadUserAvatar } from '@/hooks/users/upload-avatar';
import { toast } from 'sonner';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(),
}));

vi.mock('@/hooks/users/upload-avatar', () => ({
  uploadUserAvatar: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <button onClick={() => {}}>{children}</button>,
  TabsContent: ({ children, value }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    main: ({ children }: any) => <main>{children}</main>,
    div: ({ children }: any) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/components/user/profile-form', () => ({
  ProfileForm: () => <div data-testid="profile-form">ProfileForm</div>,
}));

vi.mock('@/components/institution-selector', () => ({
  InstitutionSelector: () => <div data-testid="institution-selector">InstitutionSelector</div>,
}));

vi.mock('@/components/loading', () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}));

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:test');
global.URL.revokeObjectURL = vi.fn();

describe('ProfileClient', () => {
  const mockProfile = {
    id: '123',
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    avatar_url: 'http://example.com/avatar.jpg',
    created_at: '2023-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when profile is loading', () => {
    vi.mocked(useProfile).mockReturnValue({ data: null, isLoading: true } as any);
    render(<ProfileClient />);
    expect(screen.getByTestId('loading')).toBeDefined();
  });

  it('renders profile data correctly', () => {
    vi.mocked(useProfile).mockReturnValue({ data: mockProfile, isLoading: false } as any);
    render(<ProfileClient />);
    
    expect(screen.getByText('Test User')).toBeDefined();
    expect(screen.getByText('@testuser')).toBeDefined();
    expect(screen.getByTestId('profile-form')).toBeDefined();
    expect(screen.getByTestId('institution-selector')).toBeDefined();
  });

  it('handles avatar upload successfully', async () => {
    vi.mocked(useProfile).mockReturnValue({ data: mockProfile, isLoading: false, refetch: vi.fn() } as any);
    vi.mocked(uploadUserAvatar).mockResolvedValue('http://example.com/new-avatar.jpg');
    
    render(<ProfileClient />);
    
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload profile picture');
    
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(uploadUserAvatar).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Profile picture updated!');
    });
  });

  it('handles avatar upload failure', async () => {
    vi.mocked(useProfile).mockReturnValue({ data: mockProfile, isLoading: false, refetch: vi.fn() } as any);
    vi.mocked(uploadUserAvatar).mockRejectedValue(new Error('Upload Failed'));
    
    render(<ProfileClient />);
    
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload profile picture');
    
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('error while updating your profile picture'));
    });
  });

  it('switches tabs correctly', () => {
    vi.mocked(useProfile).mockReturnValue({ data: mockProfile, isLoading: false } as any);
    render(<ProfileClient />);
    
    fireEvent.click(screen.getByText('EzyGo'));
    expect(screen.getByText('EzyGo Account')).toBeDefined();
    expect(screen.getByText('123')).toBeDefined(); // EzyGo ID
  });
});
