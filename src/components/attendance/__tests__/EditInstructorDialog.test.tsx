import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EditInstructorDialog } from '../EditInstructorDialog';

// Mock lucide-react with explicit icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const MockIcon = (props: any) => actual.createElement('div', props);
  return {
    UserCircle2: MockIcon,
    ShieldCheck: MockIcon,
    Loader2: MockIcon,
    AlertTriangle: MockIcon,
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
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('react-turnstile', () => ({
  default: ({ onVerify }: any) => <div data-testid="turnstile" onClick={() => onVerify('mock-token')}>Mock Turnstile</div>,
  useTurnstile: vi.fn(() => ({ reset: vi.fn() })),
}));

vi.mock('@/app/actions/instructors', () => ({
  upsertInstructorAction: vi.fn().mockResolvedValue({ success: true }),
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

describe('EditInstructorDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    courseCode: 'CS101',
    courseName: 'Intro to CS',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('renders correctly when open', async () => {
    render(<EditInstructorDialog {...defaultProps} />);
    
    expect(screen.getByText('Edit Instructor')).toBeInTheDocument();
    
    // Wait for turnstile widget to render (simulated delay)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();
  });

  it('handles form submission successfully', async () => {
    vi.useRealTimers();
    const { upsertInstructorAction } = await import('@/app/actions/instructors');
    const { toast } = await import('sonner');
    const mockOnOpenChange = vi.fn();

    render(<EditInstructorDialog {...defaultProps} onOpenChange={mockOnOpenChange} />);
    // Wait for Turnstile to be ready (it uses a 150ms timeout)
    await waitFor(() => expect(screen.getByTestId('turnstile')).toBeInTheDocument());
    
    // Fill form
    fireEvent.change(screen.getByPlaceholderText('Dr. John Doe'), { target: { value: 'Prof. Smith' } });
    
    // Verify turnstile
    fireEvent.click(screen.getByTestId('turnstile'));
    
    // Submit
    fireEvent.submit(screen.getByRole('button', { name: /Save for Class/i }));

    await waitFor(() => {
      expect(upsertInstructorAction).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
