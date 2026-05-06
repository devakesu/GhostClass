import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Loading } from '../loading';
import { handleLogout } from '@/lib/security/auth';

vi.unmock('@/components/loading');
vi.mock('ldrs/react', () => ({
  Ring2: () => <div data-testid="ring2">Ring2</div>,
}));

vi.mock('@/lib/security/auth', () => ({
  handleLogout: vi.fn(),
}));

describe('Loading', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // @ts-ignore
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.useRealTimers();
  });

  it('renders correctly in minimal mode with a message', () => {
    render(<Loading minimal={true} message="Test Message" />);
    expect(screen.getByTestId('ring2')).toBeDefined();
    expect(screen.getByText('Test Message')).toBeDefined();
    expect(screen.queryByText(/ghosting us/)).toBeNull();
  });

  it('renders correctly in full mode', () => {
    render(<Loading minimal={false} />);
    expect(screen.getByText(/ghosting us/)).toBeDefined();
  });

  it('shows warning and action buttons after 15 seconds in full mode', async () => {
    render(<Loading minimal={false} />);
    
    expect(screen.queryByText(/The site will not load if EzyGo is down/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(15001);
    });

    expect(screen.getByText(/The site will not load if EzyGo is down/)).toBeDefined();
    expect(screen.getByText('Refresh Page')).toBeDefined();
    expect(screen.getByText('Logout & Try Again')).toBeDefined();
  });

  it('does not show warning in minimal mode after 15 seconds', () => {
    render(<Loading minimal={true} />);
    
    act(() => {
      vi.advanceTimersByTime(15001);
    });

    expect(screen.queryByText(/The site will not load if EzyGo is down/)).toBeNull();
  });

  it('reloads page when refresh button is clicked', () => {
    render(<Loading minimal={false} />);
    act(() => { vi.advanceTimersByTime(15001); });

    fireEvent.click(screen.getByText('Refresh Page'));
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('calls handleLogout when logout button is clicked', async () => {
    render(<Loading minimal={false} />);
    act(() => { vi.advanceTimersByTime(15001); });

    fireEvent.click(screen.getByText('Logout & Try Again'));
    expect(handleLogout).toHaveBeenCalled();
  });
});
