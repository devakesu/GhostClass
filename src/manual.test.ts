import { describe, it, expect, vi } from 'vitest';

describe('Manual DOM Sanity', () => {
  it('should work with manual mocks', () => {
    vi.stubGlobal('window', { location: { href: 'http://localhost' } });
    vi.stubGlobal('location', { href: 'http://localhost' });
    vi.stubGlobal('document', { cookie: '' });
    const axios = require('axios');
    expect(axios).toBeDefined();
  });
});
