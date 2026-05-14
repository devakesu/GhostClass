import { describe, it, expect } from 'vitest';

import { render, screen } from '@testing-library/react';

describe('Sanity Check', () => {
  it('should render a simple div', () => {
    render(<div>Hello</div>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
