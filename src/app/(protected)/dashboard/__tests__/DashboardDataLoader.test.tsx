import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardDataLoader } from '../DashboardDataLoader';
import { fetchDashboardData } from '@/lib/ezygo-batch-fetcher';

type DashboardClientProps = {
  initialData?: unknown;
  serverError?: string;
};

vi.mock('../DashboardClient', () => ({
  default: ({ initialData, serverError }: DashboardClientProps) => (
    <div data-testid="dashboard-client">
      <span data-testid="data">{initialData ? 'has-data' : 'no-data'}</span>
      <span data-testid="error">{serverError || 'no-error'}</span>
    </div>
  )
}));

vi.mock('@/lib/ezygo-batch-fetcher', () => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
  }
}));

describe('DashboardDataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders DashboardClient with data on success', async () => {
    const mockData = { courses: [], attendance: {} };
    vi.mocked(fetchDashboardData).mockResolvedValue(mockData);

    const jsx = await DashboardDataLoader({ token: 'test-token', userId: 'user-123' });
    render(jsx);

    expect(fetchDashboardData).toHaveBeenCalledWith('test-token');
    expect(screen.getByTestId('data').textContent).toBe('has-data');
    expect(screen.getByTestId('error').textContent).toBe('no-error');
  });

  it('renders DashboardClient with error on failure', async () => {
    vi.mocked(fetchDashboardData).mockRejectedValue(new Error('Network error'));

    const jsx = await DashboardDataLoader({ token: 'test-token', userId: 'user-123' });
    render(jsx);

    expect(screen.getByTestId('data').textContent).toBe('no-data');
    expect(screen.getByTestId('error').textContent).toBe('Network error');
  });

  it('handles non-Error objects in catch block', async () => {
    vi.mocked(fetchDashboardData).mockRejectedValue('Strange error');

    const jsx = await DashboardDataLoader({ token: 'test-token', userId: 'user-123' });
    render(jsx);

    expect(screen.getByTestId('error').textContent).toBe('Strange error');
  });
});
