/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';

describe('Require Sanity', () => {
  it('should require axios', () => {
    const axios = require('axios');
    expect(axios).toBeDefined();
  });
});
