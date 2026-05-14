/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaveDataLoader } from '../LeaveDataLoader';
import { fetchLeaveData } from '@/lib/ezygo-leave-fetcher';
import { logger } from '@/lib/logger';
import * as Sentry from "@sentry/nextjs";

vi.mock('../LeaveClient', () => ({
  default: ({ initialData }: any) => (
    <div data-testid="leave-client">
      {initialData ? 'Has Data' : 'No Data'}
    </div>
  ),
}));

vi.mock('@/lib/ezygo-leave-fetcher', () => ({
  fetchLeaveData: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    dev: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('LeaveDataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches data and renders client with data on success', async () => {
    const mockData = { some: 'data' } as any;
    vi.mocked(fetchLeaveData).mockResolvedValue(mockData);

    const result = await LeaveDataLoader({ token: 'test-token' });
    render(result);

    expect(fetchLeaveData).toHaveBeenCalledWith('test-token');
    expect(screen.getByText('Has Data')).toBeInTheDocument();
    expect(logger.dev).toHaveBeenCalledWith(expect.stringContaining('fetched successfully'), expect.any(Object));
  });

  it('handles error and renders client with null on failure', async () => {
    const error = new Error('Fetch failed');
    vi.mocked(fetchLeaveData).mockRejectedValue(error);

    const result = await LeaveDataLoader({ token: 'test-token' });
    render(result);

    expect(fetchLeaveData).toHaveBeenCalledWith('test-token');
    expect(screen.getByText('No Data')).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch'), expect.any(Object));
    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
