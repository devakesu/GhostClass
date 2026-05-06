import { describe, it, expect, vi } from 'vitest';
import { GET } from '../route';

vi.mock('@scalar/nextjs-api-reference', () => ({
  ApiReference: vi.fn(() => (req: any) => new Response('Scalar UI')),
}));

vi.mock('@/lib/openapi', () => ({
  resolveOpenApiSpec: vi.fn(() => 'openapi: 3.0.0'),
}));

describe('GET /api-docs', () => {
  it('is a valid scalar handler', async () => {
    expect(GET).toBeDefined();
    expect(typeof GET).toBe('function');
    
    // Call it to ensure it's "executed"
    const response = await (GET as any)(new Request('http://localhost/api-docs'));
    expect(response).toBeDefined();
    const text = await response.text();
    expect(text).toBe('Scalar UI');
  });
});
