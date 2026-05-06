import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { InstitutionSelector } from '../institution-selector';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as institutionsHooks from '@/hooks/users/institutions';
import { toast } from 'sonner';

// Mock hooks
vi.mock('@/hooks/users/institutions', () => ({
  useInstitutions: vi.fn(),
  useDefaultInstitutionUser: vi.fn(),
  useUpdateDefaultInstitutionUser: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
  }),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('InstitutionSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state', () => {
    vi.mocked(institutionsHooks.useInstitutions).mockReturnValue({ data: undefined, isLoading: true } as any);
    vi.mocked(institutionsHooks.useDefaultInstitutionUser).mockReturnValue({ data: undefined } as any);
    vi.mocked(institutionsHooks.useUpdateDefaultInstitutionUser).mockReturnValue({ mutate: vi.fn() } as any);

    render(<InstitutionSelector />, { wrapper });
    expect(screen.getByLabelText(/Loading/i)).toBeInTheDocument();
  });

  it('renders empty state', () => {
    vi.mocked(institutionsHooks.useInstitutions).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(institutionsHooks.useDefaultInstitutionUser).mockReturnValue({ data: undefined } as any);
    vi.mocked(institutionsHooks.useUpdateDefaultInstitutionUser).mockReturnValue({ mutate: vi.fn() } as any);

    render(<InstitutionSelector />, { wrapper });
    expect(screen.getByText(/You are not enrolled in any institutions/i)).toBeInTheDocument();
  });

  it('renders list of institutions and handles selection', async () => {
    const mockInstitutions = [
      {
        id: 1,
        institution: { name: 'Institution 1' },
        institution_role: { name: 'Student' },
      },
      {
        id: 2,
        institution: { name: 'Institution 2' },
        institution_role: { name: 'Instructor' },
      },
    ];
    vi.mocked(institutionsHooks.useInstitutions).mockReturnValue({ data: mockInstitutions, isLoading: false } as any);
    vi.mocked(institutionsHooks.useDefaultInstitutionUser).mockReturnValue({ data: 1 } as any);
    
    const mockMutate = vi.fn();
    vi.mocked(institutionsHooks.useUpdateDefaultInstitutionUser).mockReturnValue({ mutate: mockMutate, isPending: false } as any);

    render(<InstitutionSelector />, { wrapper });

    expect(screen.getByText('Institution 1')).toBeInTheDocument();
    expect(screen.getByText('Institution 2')).toBeInTheDocument();

    // Select Institution 2
    const radio2 = screen.getByRole('radio', { name: /Institution 2/i });
    fireEvent.click(radio2);

    // Save button should be enabled
    const saveButton = screen.getByRole('button', { name: /Save selected institution as default/i });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    expect(mockMutate).toHaveBeenCalledWith(2, expect.any(Object));
    
    // Simulate success
    const successCallback = mockMutate.mock.calls[0][1].onSuccess;
    act(() => {
      successCallback();
    });

    expect(toast).toHaveBeenCalledWith('Institution updated', expect.any(Object));
  });

  it('handles error during update', async () => {
    const mockInstitutions = [
      { id: 1, institution: { name: 'Inst 1' }, institution_role: { name: 'Role 1' } },
      { id: 2, institution: { name: 'Inst 2' }, institution_role: { name: 'Role 2' } },
    ];
    vi.mocked(institutionsHooks.useInstitutions).mockReturnValue({ data: mockInstitutions, isLoading: false } as any);
    vi.mocked(institutionsHooks.useDefaultInstitutionUser).mockReturnValue({ data: 1 } as any);
    
    const mockMutate = vi.fn();
    vi.mocked(institutionsHooks.useUpdateDefaultInstitutionUser).mockReturnValue({ mutate: mockMutate, isPending: false } as any);

    render(<InstitutionSelector />, { wrapper });
    
    fireEvent.click(screen.getByRole('radio', { name: /Inst 2/i }));
    const saveButton = screen.getByRole('button', { name: /Save selected institution as default/i });
    fireEvent.click(saveButton);

    const errorCallback = mockMutate.mock.calls[0][1].onError;
    act(() => {
      errorCallback();
    });

    expect(toast.error).toHaveBeenCalledWith('Error', expect.any(Object));
  });
});
