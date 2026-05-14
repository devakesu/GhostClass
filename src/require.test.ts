/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';

describe('Require Sanity', () => {
  it('should require axios', async () => {
    const axios = await import('axios');
    expect(axios).toBeDefined();
  });
});
