/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import ScoresClient from './app/(protected)/scores/ScoresClient.tsx';



describe('Import Sanity', () => {
  it('should import ScoresClient', () => {
    expect(ScoresClient).toBeDefined();
  });
});
