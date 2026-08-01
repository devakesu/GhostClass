import { describe, it, expect } from 'vitest';

describe('Pure Vitest Sanity', () => {
  it('should work', () => {
    expect(Array.isArray([])).toBe(true);
  });
});
