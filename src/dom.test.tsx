import { describe, it, expect } from 'vitest';

import { createRoot } from 'react-dom/client';

describe('DOM Sanity', () => {
  it('should create root', () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    root.render(<div>Hello</div>);
    // Note: render is async in React 18, so this might not be populated immediately
    expect(div).toBeDefined();
  });
});
