/** @vitest-environment jsdom */
import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyButton, InlineCopyButton } from '../copy-button';

describe('CopyButton', () => {
  const originalClipboard = { ...navigator.clipboard };
  const originalAlert = window.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    // @ts-ignore
    delete navigator.clipboard;
  });

  afterEach(() => {
    // @ts-ignore
    navigator.clipboard = originalClipboard;
    window.alert = originalAlert;
  });

  it('handles clipboard unavailability', async () => {
    // @ts-ignore
    navigator.clipboard = undefined;

    render(<CopyButton text="test" label="Copy Me" />);
    const btn = screen.getByLabelText('Copy Me');
    fireEvent.click(btn);

    expect(window.alert).toHaveBeenCalledWith(
      "Copy to clipboard is not supported in this browser or context."
    );
  });

  it('handles writeText failure', async () => {
    // @ts-ignore
    navigator.clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error('Copy failed')),
    };

    render(<CopyButton text="test" label="Copy Me" />);
    const btn = screen.getByLabelText('Copy Me');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        "Failed to copy to clipboard. Please copy the text manually."
      );
    });
  });

  it('handles success and resets after 2s', async () => {
    // @ts-ignore
    navigator.clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };

    render(<CopyButton text="test" label="Copy Me" />);
    const btn = screen.getByLabelText('Copy Me');
    fireEvent.click(btn);

    expect(await screen.findByText('Copied')).toBeInTheDocument();
    
    // Use a longer timeout for the waitFor to account for the 2s delay
    await waitFor(() => {
      expect(screen.queryByText('Copied')).not.toBeInTheDocument();
      expect(screen.getByText('Copy Me')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

describe('InlineCopyButton', () => {
  const originalClipboard = { ...navigator.clipboard };
  const originalAlert = window.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    // @ts-ignore
    delete navigator.clipboard;
  });

  afterEach(() => {
    // @ts-ignore
    navigator.clipboard = originalClipboard;
    window.alert = originalAlert;
  });

  it('handles clipboard unavailability', async () => {
    // @ts-ignore
    navigator.clipboard = undefined;

    render(<InlineCopyButton text="test" />);
    const btn = screen.getByLabelText('Copy digest');
    fireEvent.click(btn);

    expect(window.alert).toHaveBeenCalledWith(
      "Copy to clipboard is not supported in this browser or context."
    );
  });

  it('handles writeText failure', async () => {
    // @ts-ignore
    navigator.clipboard = {
      writeText: vi.fn().mockRejectedValue(new Error('Copy failed')),
    };

    render(<InlineCopyButton text="test" />);
    const btn = screen.getByLabelText('Copy digest');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        "Failed to copy to clipboard. Please copy the text manually."
      );
    });
  });
});
