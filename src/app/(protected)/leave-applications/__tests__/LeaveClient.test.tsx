import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import LeaveClient from '../LeaveClient'

// --- Mocks ---

// Mock lucide-react icons to avoid SVG rendering issues in tests
vi.mock('lucide-react', () => ({
  Calendar: () => <div data-testid="icon-calendar" />,
  Clock: () => <div data-testid="icon-clock" />,
  FileText: () => <div data-testid="icon-file-text" />,
  CheckCircle2: () => <div data-testid="icon-check-circle" />,
  XCircle: () => <div data-testid="icon-x-circle" />,
  ArrowRight: () => <div data-testid="icon-arrow-right" />,
  User: () => <div data-testid="icon-user" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
  Home: () => <div data-testid="icon-home" />,
  RefreshCcw: () => <div data-testid="icon-refresh-ccw" />,
}))

// Mock the settings hooks used for semester filtering
import { useFetchSemester, useFetchAcademicYear } from '@/hooks/users/settings'

vi.mock('@/hooks/users/settings', () => ({
  useFetchSemester: vi.fn(),
  useFetchAcademicYear: vi.fn(),
}))
const mockUseFetchSemester = vi.mocked(useFetchSemester)
const mockUseFetchAcademicYear = vi.mocked(useFetchAcademicYear)

// --- Fixtures ---

const createMockLeave = (id: number, actionType: string | null = null, overrides: any = {}) => {
  const approvers = actionType ? [
    {
      id: id * 10,
      action_type: actionType,
      action_by_user: { first_name: 'Test', last_name: 'User' },
      action_at: '2026-03-26T10:00:00Z',
      updated_at: '2026-03-26T10:00:00Z',
    }
  ] : [];

  return {
    id,
    leave_reason: `Test Reason ${id}`,
    created_at: '2026-03-25T10:00:00Z',
    attendancetype: { name: 'Duty Leave' },
    event: { name: 'Tech Fest' },
    usersubgroup: {
      academic_semester: 'even',
      academic_year: '2025-26'
    },
    approvers,
    files: [],
    ...overrides
  }
}

// (Removed unused mockSessions)

describe('LeaveClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks()
    mockUseFetchSemester.mockReturnValue({ data: 'even', isLoading: false } as any)
    mockUseFetchAcademicYear.mockReturnValue({ data: '2025-26', isLoading: false } as any)
  })

  const renderWithClient = (ui: React.ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders error state when initialData is missing', () => {
    renderWithClient(<LeaveClient initialData={null} />)
    expect(screen.getByText(/Failed to load leave data/i)).toBeInTheDocument()
  })

  it('renders empty state when there are no leaves after filtering', () => {
    // Has a leave, but from an "odd" semester
    const initialData = {
      studentLeaves: {
        student_leaves: [
          createMockLeave(1, null, { usersubgroup: { academic_semester: 'odd', academic_year: '2025-26' } })
        ],
        student_leave_sessions: {}
      }
    }
    renderWithClient(<LeaveClient initialData={initialData} />)
    
    // Total should be 0, and empty card should show
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getByText(/No leave applications found/i)).toBeInTheDocument()
  })

  it('renders correctly filtered leaves and calculates counts', () => {
    const initialData = {
      studentLeaves: {
        student_leaves: [
          createMockLeave(1, 'approve'), // Approved
          createMockLeave(2, 'reject'),  // Rejected
          createMockLeave(3, 'recommend'), // Recommended / In Progress
          createMockLeave(4, null, { usersubgroup: { academic_semester: 'odd', academic_year: '2025-26' } }) // Filtered out
        ],
        student_leave_sessions: {}
      }
    }
    renderWithClient(<LeaveClient initialData={initialData} />)

    // Total should be 3 (1, 2, 3)
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    // Approved count should be 1
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)

    // Status badges exist
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Recommended').length).toBeGreaterThan(0)

    // Leave titles exist
    expect(screen.getByText('Test Reason 1')).toBeInTheDocument()
    expect(screen.getByText('Test Reason 2')).toBeInTheDocument()
    expect(screen.getByText('Test Reason 3')).toBeInTheDocument()
    expect(screen.queryByText('Test Reason 4')).not.toBeInTheDocument()
  })

  it('renders files when provided', () => {
    const initialData = {
      studentLeaves: {
        student_leaves: [
          createMockLeave(1, null, {
            files: [{ id: 101, file_name: 'medical_cert.pdf', size_byte: 1048576 }]
          })
        ],
        student_leave_sessions: {}
      }
    }
    render(<LeaveClient initialData={initialData} />)
    expect(screen.getByText('medical_cert.pdf')).toBeInTheDocument()
    expect(screen.getByText(/\(1\.0 MB\)/)).toBeInTheDocument()
  })
})
