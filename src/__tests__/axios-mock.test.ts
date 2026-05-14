import { describe, it, expect } from 'vitest';
import mockAxios from '../__mocks__/axios';

describe('axios mock', () => {
  it('has create function that returns an instance with interceptors', () => {
    const instance = mockAxios.create();
    expect(instance.interceptors.request.use).toBeDefined();
    expect(instance.interceptors.response.use).toBeDefined();
    expect(instance.request).toBeDefined();
  });

  it('has request and verb methods', () => {
    expect(mockAxios.request).toBeDefined();
    expect(mockAxios.get).toBeDefined();
    expect(mockAxios.post).toBeDefined();
    expect(mockAxios.put).toBeDefined();
    expect(mockAxios.patch).toBeDefined();
    expect(mockAxios.delete).toBeDefined();
  });
});
