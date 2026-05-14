/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import * as Lucide from 'lucide-react';

describe('Lucide Import Sanity', () => {
  it('should import lucide-react', () => {
    expect(Lucide).toBeDefined();
  });
});
