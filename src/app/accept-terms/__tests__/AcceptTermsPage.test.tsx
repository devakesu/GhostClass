import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AcceptTermsPage from '../page';

vi.mock('../AcceptTermsClient', () => ({
  default: () => <div data-testid="accept-terms-client" />
}));

describe('AcceptTermsPage', () => {
  it('renders AcceptTermsClient', () => {
    render(<AcceptTermsPage />);
    expect(screen.getByTestId('accept-terms-client')).toBeInTheDocument();
  });
});
