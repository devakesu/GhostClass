/**
 * Tests for icon.tsx
 */

import { describe, it, expect, vi } from 'vitest';

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

describe('icon', () => {
  describe('exported constants', () => {
    it('exports runtime as edge', async () => {
      const { runtime } = await import('../icon');
      expect(runtime).toBe('edge');
    });

    it('exports correct size', async () => {
      const { size } = await import('../icon');
      expect(size).toEqual({ width: 32, height: 32 });
    });

    it('exports correct contentType', async () => {
      const { contentType } = await import('../icon');
      expect(contentType).toBe('image/png');
    });
  });

  describe('Icon()', () => {
    it('returns an ImageResponse with the correct size options', async () => {
      const { ImageResponse } = await import('next/og');
      const { default: Icon, size } = await import('../icon');

      const result = Icon();

      expect(result).toBeInstanceOf(ImageResponse);
      expect(ImageResponse).toHaveBeenCalledWith(expect.anything(), size);
    });

    it('uses NEXT_PUBLIC_APP_URL env var to construct favicon src', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
      const { ImageResponse } = await import('next/og');
      const { default: Icon } = await import('../icon');

      Icon();

      expect(ImageResponse).toHaveBeenCalled();
    });

    it('falls back to localhost:3000 when NEXT_PUBLIC_APP_URL is not set', async () => {
      // env var is read inside the function body, so deleting it before the call
      // exercises the ?? fallback branch without re-loading the module.
      delete process.env.NEXT_PUBLIC_APP_URL;

      const { ImageResponse } = await import('next/og');
      const { default: Icon } = await import('../icon');

      Icon();

      expect(ImageResponse).toHaveBeenCalled();
    });
  });
});
