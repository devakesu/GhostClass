import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ScrollArea } from '../scroll-area';

describe('ScrollArea Component', () => {
  it('renders correctly with children', () => {
    render(
      <ScrollArea className="h-40 w-40">
        <div>Scrollable content</div>
      </ScrollArea>
    );

    expect(screen.getByText('Scrollable content')).toBeDefined();
  });

  it('applies custom className', () => {
    render(
      <ScrollArea className="custom-class">
        <div>Content</div>
      </ScrollArea>
    );

    // The root element should have the custom class
    const root = document.querySelector('[data-slot="scroll-area"]');
    expect(root?.className).toContain('custom-class');
  });
});
