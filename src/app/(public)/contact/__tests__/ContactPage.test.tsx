import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactPage from '../page';

vi.mock('../ContactClient', () => ({
  default: () => <div data-testid="contact-client" />
}));

describe('ContactPage', () => {
  it('renders ContactClient', () => {
    render(<ContactPage />);
    expect(screen.getByTestId('contact-client')).toBeInTheDocument();
  });
});
