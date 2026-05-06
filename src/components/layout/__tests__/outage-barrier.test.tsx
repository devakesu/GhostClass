import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { OutageBarrier } from '../outage-barrier';
import { useOutage } from '@/providers/outage-provider';

vi.mock('@/providers/outage-provider', () => ({
  useOutage: vi.fn(),
}));

vi.mock('@/components/service-error-view', () => ({
  ServiceErrorView: ({ onRetry }: any) => (
    <div data-testid="service-error-view">
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('OutageBarrier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there is no outage', () => {
    vi.mocked(useOutage).mockReturnValue({ hasOutage: false, resetOutage: vi.fn() } as any);
    render(<OutageBarrier />);
    expect(screen.queryByTestId('service-error-view')).toBeNull();
  });

  it('renders ServiceErrorView when an outage is detected', () => {
    vi.mocked(useOutage).mockReturnValue({ hasOutage: true, resetOutage: vi.fn() } as any);
    render(<OutageBarrier />);
    expect(screen.getByTestId('service-error-view')).toBeDefined();
  });

  it('calls resetOutage when retry is clicked', () => {
    const resetOutage = vi.fn();
    vi.mocked(useOutage).mockReturnValue({ hasOutage: true, resetOutage } as any);
    render(<OutageBarrier />);
    
    fireEvent.click(screen.getByText('Retry'));
    expect(resetOutage).toHaveBeenCalled();
  });
});
