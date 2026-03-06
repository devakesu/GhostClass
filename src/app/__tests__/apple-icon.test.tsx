/**
 * Tests for apple-icon.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/og', () => ({
  ImageResponse: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    element: unknown,
    options: unknown,
  ) {
    this._element = element;
    this._options = options;
  }),
}));

describe('apple-icon', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('exported constants', () => {
    it('exports runtime as edge', async () => {
      const { runtime } = await import('../apple-icon');
      expect(runtime).toBe('edge');
    });

    it('exports correct size', async () => {
      const { size } = await import('../apple-icon');
      expect(size).toEqual({ width: 180, height: 180 });
    });

    it('exports correct contentType', async () => {
      const { contentType } = await import('../apple-icon');
      expect(contentType).toBe('image/png');
    });
  });

  describe('AppleIcon()', () => {
    it('returns an ImageResponse with the correct size options', async () => {
      const { ImageResponse } = await import('next/og');
      const { default: AppleIcon, size } = await import('../apple-icon');

      const result = AppleIcon();

      expect(result).toBeInstanceOf(ImageResponse);
      expect(ImageResponse).toHaveBeenCalledWith(expect.anything(), size);
    });

    it('uses NEXT_PUBLIC_APP_URL env var to construct favicon src', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
      const { ImageResponse } = await import('next/og');
      const { default: AppleIcon } = await import('../apple-icon');

      AppleIcon();

      const element = (ImageResponse as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
      expect(element.props.children.props.src).toBe('https://example.com/favicon.svg');
    });

    it('falls back to localhost:3000 when NEXT_PUBLIC_APP_URL is not set', async () => {
      // env var is read inside the function body; deleting it exercises the ?? fallback branch.
      delete process.env.NEXT_PUBLIC_APP_URL;

      const { ImageResponse } = await import('next/og');
      const { default: AppleIcon } = await import('../apple-icon');

      AppleIcon();

      const element = (ImageResponse as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
      expect(element.props.children.props.src).toBe('http://localhost:3000/favicon.svg');
    });
  });
});
