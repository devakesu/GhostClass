import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotificationVirtualizer } from '../use-notification-virtualizer';
import { useVirtualizerBridge } from '../virtualizer-bridge';

// Mock the bridge
vi.mock('../virtualizer-bridge', () => ({
  useVirtualizerBridge: vi.fn(props => ({
    getVirtualItems: () => [],
    ...props,
  })),
}));

describe('useNotificationVirtualizer', () => {
  const mockItems = [
    { type: 'header', id: 'h1', label: 'Today' },
    { type: 'notification', id: 1, data: { id: 1, description: 'Short desc' } },
    { type: 'notification', id: 2, data: { id: 2, description: 'Long desc'.repeat(20) } },
  ] as any;

  it('calculates estimateSize correctly for header', () => {
    const parentRef = { current: null };
    renderHook(() => useNotificationVirtualizer({ virtualItems: mockItems, parentRef }));
    
    const { estimateSize } = vi.mocked(useVirtualizerBridge).mock.calls[0][0];
    
    expect(estimateSize(0)).toBe(57); // header
  });

  it('calculates estimateSize correctly for notification', () => {
    const parentRef = { current: null };
    renderHook(() => useNotificationVirtualizer({ virtualItems: mockItems, parentRef }));
    
    const { estimateSize } = vi.mocked(useVirtualizerBridge).mock.calls[0][0];
    
    expect(estimateSize(1)).toBeGreaterThan(80); // short notification + margin
  });

  it('calculates larger size for long notification', () => {
    const parentRef = { current: null };
    renderHook(() => useNotificationVirtualizer({ virtualItems: mockItems, parentRef }));
    
    const { estimateSize } = vi.mocked(useVirtualizerBridge).mock.calls[0][0];
    
    expect(estimateSize(2)).toBeGreaterThan(estimateSize(1));
  });
});
