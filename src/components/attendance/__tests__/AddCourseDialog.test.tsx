import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AddCourseDialog } from '../AddCourseDialog';

// Mock lucide-react with explicit icons
vi.mock('lucide-react', () => {
  const React = require('react');
  const MockIcon = (props: any) => React.createElement('div', props);
  return {
    BookPlus: MockIcon,
    Search: MockIcon,
    AlertCircle: MockIcon,
    AlertTriangle: MockIcon,
    ShieldCheck: MockIcon,
    Plus: MockIcon,
    Loader2: MockIcon,
  };
});

// Mock UI components simply
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

// Mock other dependencies
vi.mock('@/hooks/users/profile', () => ({
  useProfile: vi.fn(() => ({ data: { class: { name: 'Test Class' }, current_semester: 'even', current_year: '2023-24' } })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('react-turnstile', () => ({
  default: ({ onVerify }: any) => <div data-testid="turnstile" onClick={() => onVerify('mock-token')}>Mock Turnstile</div>,
  useTurnstile: vi.fn(() => ({ reset: vi.fn() })),
}));

vi.mock('@/app/actions/courses', () => ({
  addCourseAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/axios', () => ({
  getCsrfToken: vi.fn(() => 'csrf-123'),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AddCourseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('renders correctly when open', async () => {
    render(<AddCourseDialog open={true} onOpenChange={vi.fn()} />);
    
    expect(screen.getByText('Add New Course')).toBeInTheDocument();
    
    // Wait for turnstile widget to render (simulated delay)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();
  });

  it('handles form submission successfully', async () => {
    vi.useRealTimers();
    const { addCourseAction } = await import('@/app/actions/courses');
    const { toast } = await import('sonner');
    const mockOnOpenChange = vi.fn();

    render(<AddCourseDialog open={true} onOpenChange={mockOnOpenChange} />);
    // Wait for Turnstile to be ready (it uses a 150ms timeout)
    await waitFor(() => expect(screen.getByTestId('turnstile')).toBeInTheDocument());
    
    // Fill form
    fireEvent.change(screen.getByPlaceholderText('CS101'), { target: { value: 'GAMAT201' } });
    fireEvent.change(screen.getByPlaceholderText('Data Structures & Algorithms'), { target: { value: 'Test Course' } });
    
    // Verify turnstile
    fireEvent.click(screen.getByTestId('turnstile'));
    
    // Submit
    fireEvent.submit(screen.getByRole('button', { name: /Add Course/i }));

    await waitFor(() => {
      expect(addCourseAction).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
