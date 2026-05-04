import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock all UI components and icons
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => React.createElement('button', props, children),
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => React.createElement('span', props, children),
}));
vi.mock("@/components/ui/separator", () => ({
  Separator: () => React.createElement('hr'),
}));
vi.mock("date-fns", () => ({
  format: vi.fn((_d, _f) => "formatted-date"),
}));
vi.mock("../copy-button", () => ({
  CopyButton: () => React.createElement('div', {}, 'MockCopyButton'),
  InlineCopyButton: () => React.createElement('div', {}, 'MockInlineCopyButton'),
}));

import BuildInfoPage from '../page';

describe('Mocked BuildInfoPage', () => {
  it('should render', () => {
    vi.stubEnv('APP_COMMIT_SHA', 'abc123d');
    render(<BuildInfoPage />);
    expect(screen.getByText(/Build Information/i)).toBeInTheDocument();
  });
});
