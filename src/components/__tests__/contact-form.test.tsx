import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactForm } from '../contact-form';

// Mock dependencies
vi.mock('@/app/actions/contact', () => ({
  submitContactForm: vi.fn(),
}));

vi.mock('react-turnstile', () => ({
  default: ({ onVerify, onError, onExpire }: any) => (
    <div>
      <div data-testid="turnstile-verify" onClick={() => onVerify('mock-token')}>Verify</div>
      <div data-testid="turnstile-error" onClick={() => onError(new Error('Turnstile error'))}>Error</div>
      <div data-testid="turnstile-expire" onClick={() => onExpire()}>Expire</div>
    </div>
  ),
  useTurnstile: vi.fn(() => ({ reset: vi.fn() })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/axios', () => ({
  getCsrfToken: vi.fn(() => 'csrf-123'),
}));

vi.mock('@/hooks/use-csrf-token', () => ({
  useCSRFToken: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('lucide-react', () => ({
  Loader2: () => <span data-testid="loader" />,
  Send: () => <span data-testid="send-icon" />,
  AlertCircle: () => <span data-testid="alert-icon" />,
}));

describe('ContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key';
  });

  const fillForm = () => {
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Subject/i), { target: { value: 'Test Subject' } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'Test Message' } });
  };

  it('handles successful submission', async () => {
    const { submitContactForm } = await import('@/app/actions/contact');
    const { toast } = await import('sonner');
    (submitContactForm as any).mockResolvedValue({ success: true });

    render(<ContactForm />);
    
    fillForm();
    fireEvent.click(screen.getByTestId('turnstile-verify'));
    
    const submitButton = await screen.findByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitContactForm).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Message sent successfully!');
    });
  });

  it('handles Turnstile error state', async () => {
    const { toast } = await import('sonner');
    render(<ContactForm />);
    
    fireEvent.click(screen.getByTestId('turnstile-error'));
    
    expect(await screen.findByText(/Security check failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Security Check Failed/i })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Security check failed. Please refresh.');
  });

  it('handles Turnstile expiration', async () => {
    render(<ContactForm />);
    
    fireEvent.click(screen.getByTestId('turnstile-verify'));
    expect(await screen.findByRole('button', { name: /Send Message/i })).toBeInTheDocument();
    
    fireEvent.click(screen.getByTestId('turnstile-expire'));
    expect(await screen.findByRole('button', { name: /Waiting for Verification/i })).toBeInTheDocument();
  });

  it('handles submission error from server', async () => {
    const { submitContactForm } = await import('@/app/actions/contact');
    const { toast } = await import('sonner');
    (submitContactForm as any).mockResolvedValue({ error: 'Server error' });

    render(<ContactForm />);
    
    fillForm();
    fireEvent.click(screen.getByTestId('turnstile-verify'));
    const submitButton = await screen.findByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Server error');
    });
  });

  it('handles client-side submission exceptions', async () => {
    const { submitContactForm } = await import('@/app/actions/contact');
    const { toast } = await import('sonner');
    const { logger } = await import('@/lib/logger');
    (submitContactForm as any).mockRejectedValue(new Error('Network error'));

    render(<ContactForm />);
    
    fillForm();
    fireEvent.click(screen.getByTestId('turnstile-verify'));
    const submitButton = await screen.findByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
    });
  });

  it('handles missing FormData.set (legacy browsers edge case)', async () => {
    const { toast } = await import('sonner');
    render(<ContactForm />);
    
    fillForm();
    fireEvent.click(screen.getByTestId('turnstile-verify'));
    const submitButton = await screen.findByRole('button', { name: /Send Message/i });
    
    const originalSet = FormData.prototype.set;
    // @ts-expect-error - test-only: override private implementation for testing
    delete FormData.prototype.set;
    
    try {
      fireEvent.click(submitButton);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Something went wrong with the security check. Please try again.');
      });
    } finally {
      FormData.prototype.set = originalSet;
    }
  });

  it('shows error toast when submitting without token', async () => {
    const { toast } = await import('sonner');
    render(<ContactForm />);
    
    const form = document.querySelector('form');
    fireEvent.submit(form!);
    
    expect(toast.error).toHaveBeenCalledWith('Please complete the security check.');
  });
});
