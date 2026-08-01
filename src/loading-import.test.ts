import { describe, it, expect } from 'vitest';
import { Loading } from './components/loading.tsx';

describe('Loading Import Sanity', () => {
  it('should import Loading', () => {
    expect(Loading).toBeDefined();
  });
});
