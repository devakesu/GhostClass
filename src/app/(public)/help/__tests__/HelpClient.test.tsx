import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HelpClient from '../HelpClient';

// Mock framer-motion if used (it's not used here, but Lucide is)
vi.mock('lucide-react', () => ({
  BookOpen: () => <div data-testid="icon-book" />,
  ChevronDown: () => <div data-testid="icon-down" />,
  ChevronUp: () => <div data-testid="icon-up" />,
  HelpCircle: () => <div data-testid="icon-help" />,
  MessageSquare: () => <div data-testid="icon-message" />,
}));

describe('HelpClient', () => {
  it('renders all sections', () => {
    render(<HelpClient />);
    expect(screen.getByText('Help & FAQ')).toBeInTheDocument();
    expect(screen.getByText('Course Card Explained')).toBeInTheDocument();
    expect(screen.getByText('Correction vs Extra')).toBeInTheDocument();
    expect(screen.getByText('Attendance Chart Explained')).toBeInTheDocument();
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
  });

  it('toggles FAQ items', () => {
    render(<HelpClient />);
    const button = screen.getByRole('button', { name: /What is the bunk calculator\?/i });
    
    // Check it's hidden initially
    expect(screen.getByText(/The bunk calculator tells you/i)).not.toBeVisible();

    fireEvent.click(button);
    expect(screen.getByText(/The bunk calculator tells you/i)).toBeVisible();

    fireEvent.click(button);
    expect(screen.getByText(/The bunk calculator tells you/i)).not.toBeVisible();
  });

  it('renders mock components', () => {
    render(<HelpClient />);
    expect(screen.getAllByTestId('mock-course-card')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Data Structures & Algorithms')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Target: 75%')[0]).toBeInTheDocument();
  });

  it('handles malformed questions', () => {
    render(<HelpClient />);
  });
});
