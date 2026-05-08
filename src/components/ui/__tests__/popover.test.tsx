import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';

describe('Popover Component', () => {
  it('renders correctly and opens on click', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    expect(screen.getByText('Open')).toBeDefined();
    // Content is initially not in the DOM because of Portal/Radix
    
    fireEvent.click(screen.getByText('Open'));
    
    // Radix UI components might need a bit of time or proper environment to show up
    // In jsdom, we can usually see it after fireEvent
    expect(await screen.findByText('Content')).toBeDefined();
  });
});
