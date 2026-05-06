import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HelpPage from '../page';

vi.mock('../HelpClient', () => ({
  default: () => <div data-testid="help-client" />
}));

describe('HelpPage', () => {
  it('renders HelpClient', () => {
    render(<HelpPage />);
    expect(screen.getByTestId('help-client')).toBeInTheDocument();
  });
});
