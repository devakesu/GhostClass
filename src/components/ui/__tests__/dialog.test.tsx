/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../dialog';

describe('Dialog UI Components', () => {
  it('renders all dialog sub-components', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <div>Content</div>
          <DialogFooter>
            <DialogClose>UniqueCloseButton</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    fireEvent.click(screen.getByText('Open Dialog'));

    expect(await screen.findByText('Title')).toBeInTheDocument();
    expect(await screen.findByText('Description')).toBeInTheDocument();
    expect(await screen.findByText('Content')).toBeInTheDocument();
    expect(await screen.findByText('UniqueCloseButton')).toBeInTheDocument();
  });

  it('renders without close button when showCloseButton is false', () => {
    render(
      <Dialog open={true}>
        <DialogContent showCloseButton={false}>
          <div>Content</div>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });
});
