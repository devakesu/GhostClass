import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LegalPage from '../page';

vi.mock('../LegalClient', () => ({
  default: () => <div data-testid="legal-client" />
}));

describe('LegalPage', () => {
  it('renders LegalClient', () => {
    render(<LegalPage />);
    expect(screen.getByTestId('legal-client')).toBeInTheDocument();
  });
});
