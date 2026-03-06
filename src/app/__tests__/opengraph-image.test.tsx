/**
 * Tests for opengraph-image.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// vi.hoisted ensures mockReadFileSync is defined before vi.mock factories are evaluated.
const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}));

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
    vi.clearAllMocks();
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
    it('reads the icon file and includes a base64 img element when the file is readable', async () => {
      // Configure readFileSync to return a known buffer before the module loads.
      const fakeBuffer = Buffer.from('fake-png-bytes');
      mockReadFileSync.mockReturnValue(fakeBuffer);

      const { default: Image } = await import('../opengraph-image');
      const { ImageResponse } = await import('next/og');
      Image();

      // readFileSync was invoked during the IIFE
      expect(mockReadFileSync).toHaveBeenCalled();

      // The img element is present and its src is a base64 data URI
      const element = (ImageResponse as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
      const imgElement = element.props.children[0];
      expect(imgElement).toBeTruthy();
      expect(imgElement.props.src).toMatch(/^data:image\/png;base64,/);
    });

    it('omits the img element when the icon file cannot be read', async () => {
      // Configure readFileSync to throw before the module loads.
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const { default: Image } = await import('../opengraph-image');
      const { ImageResponse } = await import('next/og');
      Image();

      // readFileSync was called but threw — iconSrc is null
      expect(mockReadFileSync).toHaveBeenCalled();

      // {iconSrc && <img/>} evaluates to null/false when iconSrc is null
      const element = (ImageResponse as ReturnType<typeof vi.fn>).mock.calls[0][0] as any;
      const firstChild = element.props.children[0];
      expect(firstChild).toBeFalsy();
    });
  });
});
