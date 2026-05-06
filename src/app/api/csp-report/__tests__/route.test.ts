import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('POST /api/csp-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createReq = (body: any, contentType: string, contentLength?: string) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const buffer = Buffer.from(text);
    
    return {
      headers: {
        get: vi.fn((name) => {
          if (name.toLowerCase() === 'content-type') return contentType;
          if (name.toLowerCase() === 'content-length') return contentLength ?? buffer.byteLength.toString();
          return null;
        }),
      },
      arrayBuffer: vi.fn().mockResolvedValue(buffer),
    } as any;
  };

  it('rejects unsupported content types', async () => {
    const req = createReq({}, 'text/plain');
    const response = await POST(req);
    expect(response.status).toBe(415);
  });

  it('rejects oversized requests via content-length', async () => {
    const req = createReq({}, 'application/csp-report', '9000');
    const response = await POST(req);
    expect(response.status).toBe(413);
  });

  it('rejects negative content-length', async () => {
    const req = createReq({}, 'application/csp-report', '-10');
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('processes legacy CSP report format', async () => {
    const body = {
      'csp-report': {
        'document-uri': 'http://example.com/page?token=secret',
        'blocked-uri': 'http://evil.com/script.js',
        'violated-directive': 'script-src',
        'original-policy': 'default-src self',
      },
    };
    const req = createReq(body, 'application/csp-report');
    const response = await POST(req);

    expect(response.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Violation report received'),
      expect.objectContaining({
        'document-uri': 'http://example.com/page', // Sanitized
        'blocked-uri': 'http://evil.com/script.js',
        'violated-directive': 'script-src',
      })
    );
  });

  it('processes modern Reporting API format', async () => {
    const body = [{
      body: {
        documentURL: 'http://example.com/modern',
        blockedURL: 'http://evil.com/modern.js',
        effectiveDirective: 'img-src',
      },
    }];
    const req = createReq(body, 'application/reports+json');
    const response = await POST(req);

    expect(response.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Violation report received'),
      expect.objectContaining({
        'document-uri': 'http://example.com/modern',
        'blocked-uri': 'http://evil.com/modern.js',
        'violated-directive': 'img-src',
      })
    );
  });

  it('handles malformed JSON body gracefully', async () => {
    const req = createReq('invalid-json', 'application/csp-report');
    const response = await POST(req);
    expect(response.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        {}
    );
  });

  it('handles oversized body detected during reading', async () => {
    const largeBuffer = Buffer.alloc(9000);
    const req = {
        headers: {
            get: vi.fn((name) => {
                if (name.toLowerCase() === 'content-type') return 'application/csp-report';
                return null; // No content-length
            }),
        },
        arrayBuffer: vi.fn().mockResolvedValue(largeBuffer),
    } as any;
    
    const response = await POST(req);
    expect(response.status).toBe(413);
  });
});
