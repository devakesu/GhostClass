import { describe, it, expect, vi } from 'vitest';

describe('Manual DOM Sanity', () => {
  it('should work with manual mocks', async () => {
    vi.stubGlobal('window', { location: { href: 'http://localhost' } });
    vi.stubGlobal('location', { href: 'http://localhost' });
    vi.stubGlobal('document', { cookie: '' });
    const axios = await import('axios');
    expect(axios).toBeDefined();
  });
});
