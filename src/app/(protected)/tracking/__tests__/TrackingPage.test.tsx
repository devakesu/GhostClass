import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrackingPage from '../page';

// Mock TrackingClient
vi.mock('../TrackingClient', () => ({
  default: () => <div data-testid="tracking-client">TrackingClient</div>,
}));

describe('TrackingPage', () => {
  it('renders TrackingClient', () => {
    render(<TrackingPage />);
    expect(screen.getByTestId('tracking-client')).toBeInTheDocument();
  });
});
