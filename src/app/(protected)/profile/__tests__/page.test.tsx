import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ProfilePage from '../page';

vi.mock('../ProfileClient', () => ({
  default: () => <div data-testid="profile-client">ProfileClient</div>,
}));

describe('ProfilePage', () => {
  it('renders ProfileClient', () => {
    render(<ProfilePage />);
    expect(screen.getByTestId('profile-client')).toBeDefined();
  });
});
