/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import * as FramerMotion from 'framer-motion';

describe('Framer Motion Import Sanity', () => {
  it('should import framer-motion', () => {
    expect(FramerMotion).toBeDefined();
  });
});
