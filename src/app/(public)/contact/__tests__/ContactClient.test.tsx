import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContactClient from '../ContactClient';
import { createClient } from '@/lib/supabase/server';

// Mock the supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock the ContactForm component
vi.mock('@/components/contact-form', () => ({
  ContactForm: ({ userDetails }: any) => (
    <div data-testid="contact-form">
      {userDetails ? `User: ${userDetails.name} (${userDetails.email})` : 'Anonymous'}
    </div>
  ),
}));

describe('ContactClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly for anonymous user', async () => {
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);

    const Result = await ContactClient();
    render(Result);

    expect(screen.getByText('Contact Us')).toBeInTheDocument();
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
  });

  it('renders correctly for logged-in user with profile', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockProfile = { first_name: 'John', last_name: 'Doe', email: 'john@example.com' };
    
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProfile }),
    };
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);

    const Result = await ContactClient();
    render(Result);

    expect(screen.getByText('User: John Doe (john@example.com)')).toBeInTheDocument();
  });

  it('handles profile fetch failure gracefully', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);

    const Result = await ContactClient();
    render(Result);

    expect(screen.getByText('Anonymous')).toBeInTheDocument();
  });
});
