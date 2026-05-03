import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Simple Test', () => {
  it('renders a div', () => {
    render(<div data-testid="test">Hello</div>);
    expect(screen.getByTestId('test')).toBeInTheDocument();
  });
});
