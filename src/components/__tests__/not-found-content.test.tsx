import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotFoundContent } from '../not-found-content';
import { useRouter } from 'next/navigation';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

describe('NotFoundContent Component', () => {
  const mockPush = vi.fn();
  const mockBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: mockPush,
      back: mockBack,
    });
  });

  it('renders correctly', () => {
    render(<NotFoundContent />);
    expect(screen.getByText('404')).toBeDefined();
    expect(screen.getByText('Page Not Found')).toBeDefined();
    expect(screen.getByText('Go Home')).toBeDefined();
    expect(screen.getByText('Go Back')).toBeDefined();
  });

  it('navigates home when Go Home is clicked', () => {
    render(<NotFoundContent />);
    fireEvent.click(screen.getByText('Go Home'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('navigates back when Go Back is clicked', () => {
    render(<NotFoundContent />);
    fireEvent.click(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
