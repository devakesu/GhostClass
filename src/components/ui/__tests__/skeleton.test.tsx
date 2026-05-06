import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Skeleton } from '../skeleton';

describe('Skeleton Component', () => {
  it('renders correctly', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toBeDefined();
    expect(skeleton.className).toContain('animate-pulse');
  });

  it('applies custom className', () => {
    render(<Skeleton data-testid="skeleton" className="custom-class" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('custom-class');
  });
});
