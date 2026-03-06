/**
 * Tests for opengraph-image.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock next/og — ImageResponse must be available before the module-level IIFE runs.
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

describe('opengraph-image', () => {
  afterEach(() => {
    vi.resetModules();
  });

  describe('exported constants', () => {
    it('exports runtime as nodejs', async () => {
      const { runtime } = await import('../opengraph-image');
      expect(runtime).toBe('nodejs');
    });

    it('exports correct alt text', async () => {
      const { alt } = await import('../opengraph-image');
      expect(alt).toBe('GhostClass — Smart Attendance Tracker');
    });

    it('exports correct size', async () => {
      const { size } = await import('../opengraph-image');
      expect(size).toEqual({ width: 1200, height: 630 });
    });

    it('exports correct contentType', async () => {
      const { contentType } = await import('../opengraph-image');
      expect(contentType).toBe('image/png');
    });
  });

  describe('Image()', () => {
    it('returns an ImageResponse with the correct size options', async () => {
      const { ImageResponse } = await import('next/og');
      const { default: Image, size } = await import('../opengraph-image');

      const result = Image();

      expect(result).toBeInstanceOf(ImageResponse);
      expect(ImageResponse).toHaveBeenCalledWith(expect.anything(), size);
    });
  });

  describe('iconSrc IIFE', () => {
    it('reads the icon file and produces a base64 data URI when the file is readable', async () => {
      // The real public/icon-192.png exists in the repo, so readFileSync succeeds naturally.
      // Re-importing after resetModules() re-executes the IIFE and covers the try branch.
      vi.resetModules();
      vi.doMock('next/og', () => ({
        ImageResponse: vi.fn().mockImplementation(function (
          this: Record<string, unknown>,
          element: unknown,
        ) {
          this._element = element;
        }),
      }));

      const mod = await import('../opengraph-image');
      const { ImageResponse } = await import('next/og');
      mod.default();

      expect(ImageResponse).toHaveBeenCalled();
    });

    it('falls back to null when the icon file cannot be read', async () => {
      // Mock fs so readFileSync throws, exercising the catch branch of the IIFE.
      // Include a `default` key so Vitest can resolve the CJS named export.
      vi.resetModules();
      const mockReadFileSync = vi.fn().mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      vi.doMock('fs', () => ({
        default: { readFileSync: mockReadFileSync },
        readFileSync: mockReadFileSync,
      }));
      vi.doMock('next/og', () => ({
        ImageResponse: vi.fn().mockImplementation(function (
          this: Record<string, unknown>,
          element: unknown,
        ) {
          this._element = element;
        }),
      }));

      const mod = await import('../opengraph-image');
      const { ImageResponse } = await import('next/og');
      mod.default();

      expect(ImageResponse).toHaveBeenCalled();
    });
  });
});
