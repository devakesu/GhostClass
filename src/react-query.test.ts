/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
vi.stubGlobal('XMLHttpRequest', undefined);
import * as ReactQuery from '@tanstack/react-query';

describe('React Query Import Sanity', () => {
  it('should import react-query', () => {
    expect(ReactQuery).toBeDefined();
  });
});
