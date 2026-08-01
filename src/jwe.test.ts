/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import * as JweClient from './lib/security/jwe-client.ts';

describe('JWE Client Import Sanity', () => {
  it('should import jwe-client', () => {
    expect(JweClient).toBeDefined();
  });
});
