import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '../not-found';

vi.mock('@/components/layout/public-navbar', () => ({
  PublicNavbar: () => <nav>PublicNavbar</nav>,
}));

vi.mock('@/components/layout/footer', () => ({
  Footer: () => <footer>Footer</footer>,
}));

vi.mock('@/components/not-found-content', () => ({
  NotFoundContent: () => <div>NotFoundContent</div>,
}));

describe('NotFound', () => {
  it('renders correctly', () => {
    render(<NotFound />);
    expect(screen.getByText('PublicNavbar')).toBeDefined();
    expect(screen.getByText('NotFoundContent')).toBeDefined();
    expect(screen.getByText('Footer')).toBeDefined();
  });
});
