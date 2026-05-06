import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { AnalyticsTracker, trackEvent } from '../analytics-tracker';
import { usePathname, useSearchParams } from 'next/navigation';
import { logger } from '@/lib/logger';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  getOrCreateClientId: vi.fn(() => 'test-client-id'),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('AnalyticsTracker', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    
    vi.mocked(usePathname).mockReturnValue('/test-path');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('?foo=bar') as any);
    
    // Mock window.location
    // @ts-ignore
    delete window.location;
    window.location = {
      ...originalLocation,
      origin: 'http://localhost:3000',
      hostname: 'localhost',
      href: 'http://localhost:3000/test-path?foo=bar',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.location = originalLocation;
  });

  it('tracks page view on mount', async () => {
    render(<AnalyticsTracker />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('page_view'),
      }));
    });
  });

  it('tracks scroll depth', async () => {
    render(<AnalyticsTracker />);
    
    // Mock scroll height
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    window.innerHeight = 1000;
    
    // Simulate scroll to 25%
    window.scrollY = 250;
    fireEvent.scroll(window);

    // Need to wait for requestAnimationFrame
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('scroll'),
      }));
    });
  });

  it('tracks outbound link clicks', async () => {
    render(<AnalyticsTracker />);
    
    const link = document.createElement('a');
    link.href = 'https://external.com';
    document.body.appendChild(link);
    
    fireEvent.click(link);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('click'),
      }));
    });
    
    document.body.removeChild(link);
  });

  it('tracks file downloads', async () => {
    render(<AnalyticsTracker />);
    
    const link = document.createElement('a');
    link.href = 'http://localhost:3000/file.pdf';
    document.body.appendChild(link);
    
    fireEvent.click(link);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('file_download'),
      }));
    });
    
    document.body.removeChild(link);
  });

  it('tracks form interactions', async () => {
    render(<AnalyticsTracker />);
    
    const form = document.createElement('form');
    form.id = 'test-form';
    const input = document.createElement('input');
    form.appendChild(input);
    document.body.appendChild(form);
    
    fireEvent.focusIn(input);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('form_start'),
      }));
    });

    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('form_submit'),
      }));
    });
    
    document.body.removeChild(form);
  });

  it('tracks video events', async () => {
    render(<AnalyticsTracker />);
    
    const video = document.createElement('video');
    video.src = 'test.mp4';
    
    // Mock video properties
    Object.defineProperties(video, {
      duration: { value: 100, configurable: true },
      currentTime: { value: 50, writable: true, configurable: true },
      currentSrc: { value: 'http://localhost:3000/test.mp4', configurable: true },
    });
    
    document.body.appendChild(video);
    
    fireEvent.play(video);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('video_start'),
      }));
    });

    fireEvent.pause(video);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('video_progress'),
      }));
    });

    // Move to end
    // @ts-ignore
    video.currentTime = 100;
    fireEvent.ended(video);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
        body: expect.stringContaining('video_complete'),
      }));
    });
    
    document.body.removeChild(video);
  });
});

describe('trackEvent', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('sends custom events to track API', async () => {
    await trackEvent('custom_event', { key: 'value' });
    
    expect(global.fetch).toHaveBeenCalledWith('/api/analytics/track', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('custom_event'),
    }));
  });

  it('safely handles circular references and DOM nodes in params', async () => {
    const circular: any = { name: 'circular' };
    circular.self = circular;
    
    await trackEvent('safe_event', { 
      circular,
      node: document.createElement('div')
    });
    
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]!.body as string);
    expect(body.events[0].params.circular.name).toBe('circular');
    expect(body.events[0].params.circular.self).toBeUndefined();
    expect(body.events[0].params.node).toBeUndefined();
  });

  it('logs warning on fetch failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Fetch Failed'));
    
    await trackEvent('fail_event');
    
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to track event'), expect.any(Error));
  });
});
