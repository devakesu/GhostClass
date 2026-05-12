import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

describe('DOM Sanity', () => {
  it('should create root', async () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    await act(async () => {
      root.render(<div>Hello</div>);
    });
    expect(div).toBeDefined();
  });
});
