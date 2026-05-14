 
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PublicNavbar } from '../public-navbar';

// Mock Next.js Link and Image
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: any) => <img {...props} />,
}));

describe('PublicNavbar', () => {
  it('renders the logo link correctly', () => {
    render(<PublicNavbar />);
    const logoLink = screen.getByRole('link', { name: /GhostClass Logo/i });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute('href', '/');
    
    const logoImg = screen.getByAltText(/GhostClass Logo/i);
    expect(logoImg).toBeInTheDocument();
  });

  it('renders the dashboard button link', () => {
    render(<PublicNavbar />);
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });
});
