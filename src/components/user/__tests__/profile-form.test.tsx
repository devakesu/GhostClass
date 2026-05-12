import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProfileForm } from '../profile-form';
import { useUpdateProfile } from '@/hooks/users/profile';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('@/hooks/users/profile', () => ({
  useUpdateProfile: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    main: (props: any) => <main {...props} />,
    div: (props: any) => <div {...props} />,
    form: (props: any) => <form {...props} />,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../delete-account', () => ({
  DeleteAccount: () => <div data-testid="delete-account">DeleteAccount</div>,
}));

describe('ProfileForm Component', () => {
  const mockProfile = {
    id: '123',
    first_name: 'John',
    last_name: 'Doe',
    gender: 'male',
    birth_date: '1990-01-01',
    created_at: '2023-01-01T00:00:00Z',
  };

  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useUpdateProfile as any).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('renders correctly in read-only mode', () => {
    render(<ProfileForm profile={mockProfile as any} />);
    
    expect(screen.getByDisplayValue('John')).toBeDefined();
    expect(screen.getByDisplayValue('Doe')).toBeDefined();
    expect(screen.getByDisplayValue('Male')).toBeDefined();
    expect(screen.getByDisplayValue('1990-01-01')).toBeDefined();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('switches to editing mode', () => {
    render(<ProfileForm profile={mockProfile as any} />);
    
    fireEvent.click(screen.getByLabelText('Edit profile'));
    
    expect(screen.getByText('Save')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('submits form successfully', async () => {
    render(<ProfileForm profile={mockProfile as any} />);
    
    fireEvent.click(screen.getByLabelText('Edit profile'));
    
    fireEvent.change(screen.getByPlaceholderText('Enter first name'), { target: { value: 'Jane' } });
    
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
      const callArgs = mockMutate.mock.calls[0][0];
      expect(callArgs.data.first_name).toBe('Jane');
    });
    
    // Simulate success
    const successCallback = mockMutate.mock.calls[0][1].onSuccess;
    act(() => {
      successCallback();
    });
    
    expect(toast.success).toHaveBeenCalledWith('Profile updated');
  });

  it('handles submission error', async () => {
    render(<ProfileForm profile={mockProfile as any} />);
    
    fireEvent.click(screen.getByLabelText('Edit profile'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    });
    
    // Simulate error
    const errorCallback = mockMutate.mock.calls[0][1].onError;
    act(() => {
      errorCallback(new Error('Update failed'));
    });
    
    expect(toast.error).toHaveBeenCalledWith('Failed to update profile');
  });
});
