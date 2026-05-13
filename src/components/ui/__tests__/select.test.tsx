 
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../select';

// Mock Radix UI Select components
vi.mock('@radix-ui/react-select', () => ({
  Root: ({ children, ...props }: any) => <div data-testid="select-root" {...props}>{children}</div>,
  Group: ({ children, ...props }: any) => <div data-testid="select-group" {...props}>{children}</div>,
  Value: ({ children, placeholder, ...props }: any) => (
    <span data-testid="select-value" {...props}>{children || placeholder}</span>
  ),
  Trigger: ({ children, ...props }: any) => (
    <button data-testid="select-trigger" {...props}>{children}</button>
  ),
  Icon: ({ children, ...props }: any) => (
    <span data-testid="select-icon" {...props}>{children}</span>
  ),
  Portal: ({ children }: any) => <div data-testid="select-portal">{children}</div>,
  Content: ({ children, ...props }: any) => (
    <div data-testid="select-content" {...props}>{children}</div>
  ),
  Viewport: ({ children, ...props }: any) => (
    <div data-testid="select-viewport" {...props}>{children}</div>
  ),
  Label: ({ children, ...props }: any) => (
    <div data-testid="select-label" {...props}>{children}</div>
  ),
  Item: ({ children, ...props }: any) => (
    <div data-testid="select-item" {...props}>{children}</div>
  ),
  ItemText: ({ children, ...props }: any) => (
    <span data-testid="select-item-text" {...props}>{children}</span>
  ),
  ItemIndicator: ({ children, ...props }: any) => (
    <span data-testid="select-item-indicator" {...props}>{children}</span>
  ),
  Separator: (props: any) => <div data-testid="select-separator" {...props} />,
  ScrollUpButton: ({ children, ...props }: any) => (
    <button data-testid="select-scroll-up" {...props}>{children}</button>
  ),
  ScrollDownButton: ({ children, ...props }: any) => (
    <button data-testid="select-scroll-down" {...props}>{children}</button>
  ),
}));

describe('Select Components', () => {
  describe('Select (Root)', () => {
    it('should render Select root component', () => {
      render(<Select><div>Content</div></Select>);
      
      const root = screen.getByTestId('select-root');
      expect(root).toBeInTheDocument();
      expect(root).toHaveAttribute('data-slot', 'select');
    });

    it('should pass through props to Select root', () => {
      render(<Select defaultValue="test" data-testvalue="test"><div>Content</div></Select>);
      
      const root = screen.getByTestId('select-root');
      // defaultValue is a React prop, not an HTML attribute
      // Test that additional props are passed through
      expect(root).toHaveAttribute('data-testvalue', 'test');
    });
  });

  describe('SelectGroup', () => {
    it('should render SelectGroup component', () => {
      render(<SelectGroup><div>Items</div></SelectGroup>);
      
      const group = screen.getByTestId('select-group');
      expect(group).toBeInTheDocument();
      expect(group).toHaveAttribute('data-slot', 'select-group');
    });
  });

  describe('SelectValue', () => {
    it('should render SelectValue component', () => {
      render(<SelectValue placeholder="Select an option" />);
      
      const value = screen.getByTestId('select-value');
      expect(value).toBeInTheDocument();
      expect(value).toHaveAttribute('data-slot', 'select-value');
    });

    it('should display placeholder when no value', () => {
      render(<SelectValue placeholder="Choose..." />);
      
      expect(screen.getByText('Choose...')).toBeInTheDocument();
    });
  });

  describe('SelectTrigger', () => {
    it('should render SelectTrigger with default size', () => {
      render(<SelectTrigger><SelectValue /></SelectTrigger>);
      
      const trigger = screen.getByTestId('select-trigger');
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('data-slot', 'select-trigger');
      expect(trigger).toHaveAttribute('data-size', 'default');
    });

    it('should render SelectTrigger with small size', () => {
      render(<SelectTrigger size="sm"><SelectValue /></SelectTrigger>);
      
      const trigger = screen.getByTestId('select-trigger');
      expect(trigger).toHaveAttribute('data-size', 'sm');
    });

    it('should render chevron icon in trigger', () => {
      render(<SelectTrigger><SelectValue /></SelectTrigger>);
      
      const icon = screen.getByTestId('select-icon');
      expect(icon).toBeInTheDocument();
    });

    it('should apply custom className to trigger', () => {
      render(<SelectTrigger className="custom-class"><SelectValue /></SelectTrigger>);
      
      const trigger = screen.getByTestId('select-trigger');
      expect(trigger).toHaveClass('custom-class');
    });
  });

  describe('SelectContent', () => {
    it('should render SelectContent in portal', () => {
      render(<SelectContent><SelectItem value="1">Item 1</SelectItem></SelectContent>);
      
      const portal = screen.getByTestId('select-portal');
      const content = screen.getByTestId('select-content');
      expect(portal).toBeInTheDocument();
      expect(content).toBeInTheDocument();
      expect(content).toHaveAttribute('data-slot', 'select-content');
    });

    it('should use popper position by default', () => {
      render(<SelectContent><SelectItem value="1">Item 1</SelectItem></SelectContent>);
      
      const content = screen.getByTestId('select-content');
      expect(content).toHaveAttribute('position', 'popper');
    });

    it('should render scroll buttons', () => {
      render(<SelectContent><SelectItem value="1">Item 1</SelectItem></SelectContent>);
      
      expect(screen.getByTestId('select-scroll-up')).toBeInTheDocument();
      expect(screen.getByTestId('select-scroll-down')).toBeInTheDocument();
    });

    it('should apply custom className to content', () => {
      render(<SelectContent className="custom-content"><SelectItem value="1">Item 1</SelectItem></SelectContent>);
      
      const content = screen.getByTestId('select-content');
      expect(content).toHaveClass('custom-content');
    });
  });

  describe('SelectLabel', () => {
    it('should render SelectLabel', () => {
      render(<SelectLabel>Category</SelectLabel>);
      
      const label = screen.getByTestId('select-label');
      expect(label).toBeInTheDocument();
      expect(label).toHaveAttribute('data-slot', 'select-label');
      expect(screen.getByText('Category')).toBeInTheDocument();
    });

    it('should apply custom className to label', () => {
      render(<SelectLabel className="custom-label">Label</SelectLabel>);
      
      const label = screen.getByTestId('select-label');
      expect(label).toHaveClass('custom-label');
    });
  });

  describe('SelectItem', () => {
    it('should render SelectItem', () => {
      render(<SelectItem value="test">Test Item</SelectItem>);
      
      const item = screen.getByTestId('select-item');
      expect(item).toBeInTheDocument();
      expect(item).toHaveAttribute('data-slot', 'select-item');
      expect(item).toHaveAttribute('value', 'test');
    });

    it('should render item text', () => {
      render(<SelectItem value="test">Test Item</SelectItem>);
      
      const itemText = screen.getByTestId('select-item-text');
      expect(itemText).toBeInTheDocument();
      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    it('should render item indicator', () => {
      render(<SelectItem value="test">Test Item</SelectItem>);
      
      const indicator = screen.getByTestId('select-item-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('should apply custom className to item', () => {
      render(<SelectItem value="test" className="custom-item">Test Item</SelectItem>);
      
      const item = screen.getByTestId('select-item');
      expect(item).toHaveClass('custom-item');
    });
  });

  describe('SelectSeparator', () => {
    it('should render SelectSeparator', () => {
      render(<SelectSeparator />);
      
      const separator = screen.getByTestId('select-separator');
      expect(separator).toBeInTheDocument();
      expect(separator).toHaveAttribute('data-slot', 'select-separator');
    });

    it('should apply custom className to separator', () => {
      render(<SelectSeparator className="custom-separator" />);
      
      const separator = screen.getByTestId('select-separator');
      expect(separator).toHaveClass('custom-separator');
    });
  });

  describe('SelectScrollUpButton', () => {
    it('should render scroll up button', () => {
      render(<SelectScrollUpButton />);
      
      const button = screen.getByTestId('select-scroll-up');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('data-slot', 'select-scroll-up-button');
    });

    it('should apply custom className to scroll up button', () => {
      render(<SelectScrollUpButton className="custom-scroll-up" />);
      
      const button = screen.getByTestId('select-scroll-up');
      expect(button).toHaveClass('custom-scroll-up');
    });
  });

  describe('SelectScrollDownButton', () => {
    it('should render scroll down button', () => {
      render(<SelectScrollDownButton />);
      
      const button = screen.getByTestId('select-scroll-down');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('data-slot', 'select-scroll-down-button');
    });

    it('should apply custom className to scroll down button', () => {
      render(<SelectScrollDownButton className="custom-scroll-down" />);
      
      const button = screen.getByTestId('select-scroll-down');
      expect(button).toHaveClass('custom-scroll-down');
    });
  });

  describe('Integration', () => {
    it('should render complete select component', () => {
      render(
        <Select defaultValue="1">
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Options</SelectLabel>
              <SelectItem value="1">Option 1</SelectItem>
              <SelectItem value="2">Option 2</SelectItem>
              <SelectSeparator />
              <SelectItem value="3">Option 3</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('select-root')).toBeInTheDocument();
      expect(screen.getByTestId('select-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('select-value')).toBeInTheDocument();
    });

    it('should handle size variants correctly', () => {
      const { rerender } = render(
        <SelectTrigger size="default"><SelectValue /></SelectTrigger>
      );
      
      let trigger = screen.getByTestId('select-trigger');
      expect(trigger).toHaveAttribute('data-size', 'default');

      rerender(<SelectTrigger size="sm"><SelectValue /></SelectTrigger>);
      
      trigger = screen.getByTestId('select-trigger');
      expect(trigger).toHaveAttribute('data-size', 'sm');
    });

    it('should maintain data-slot attributes for styling', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveAttribute('data-slot', 'select-trigger');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty SelectContent', () => {
      render(<SelectContent></SelectContent>);
      
      const content = screen.getByTestId('select-content');
      expect(content).toBeInTheDocument();
    });

    it('should handle SelectItem without children', () => {
      render(<SelectItem value="empty"></SelectItem>);
      
      const item = screen.getByTestId('select-item');
      expect(item).toBeInTheDocument();
    });

    it('should handle multiple SelectGroups', () => {
      render(
        <SelectContent>
          <SelectGroup><SelectItem value="1">Item 1</SelectItem></SelectGroup>
          <SelectSeparator />
          <SelectGroup><SelectItem value="2">Item 2</SelectItem></SelectGroup>
        </SelectContent>
      );

      const groups = screen.getAllByTestId('select-group');
      expect(groups).toHaveLength(2);
    });
  });
});
