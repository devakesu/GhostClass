/**
 * Tests for GET /api/user/profile
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { decrypt } from "@/lib/crypto";
import { performProfileSync } from "@/lib/user/sync";
import { getAdminClient } from "@/lib/supabase/admin";

// Mock dependencies
vi.mock("server-only", () => ({}));

const mockAdminSelect = vi.fn();
const mockAdminEq = vi.fn();
const mockAdminMaybeSingle = vi.fn();
const mockAdminSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((_iv, content) => `decrypted-${content}`),
}));

vi.mock("@/lib/logic/academic", () => ({
  calculateCurrentAcademicInfo: vi.fn(({ semester, year }) => ({
    current_semester: semester || 1,
    current_year: year || 2024,
  })),
}));

vi.mock("@/lib/security/app-check", () => ({
  withSecurity: vi.fn((handler) => handler),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@/lib/user/sync", () => ({
  performProfileSync: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const MOCK_USER = { id: "auth-user-id-123" };
const MOCK_DB_USER = {
  id: 1,
  auth_id: MOCK_USER.id,
  username: "testuser",
  email: "test@example.com",
  first_name: "Test",
  last_name: "User",
  ezygo_token: "encrypted-token",
  ezygo_iv: "iv",
  current_semester: 2,
  current_year: 2025,
  terms_version: "1.0",
  terms_accepted_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
  ezygo_created_at: "2024-01-01T00:00:00Z",
  class: { id: "class-1", name: "Class 1" }
};

describe("GET /api/user/profile", () => {
  const mockAuthGetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    const mockSupabase = {
      auth: { getUser: mockAuthGetUser },
      from: vi.fn().mockReturnThis(),
      select: mockAdminSelect,
      eq: mockAdminEq,
      maybeSingle: mockAdminMaybeSingle,
      single: mockAdminSingle,
    };
    
    (getAdminClient as any).mockReturnValue(mockSupabase);

    mockAdminSelect.mockReturnThis();
    mockAdminEq.mockReturnThis();
    mockAdminMaybeSingle.mockResolvedValue({ data: MOCK_DB_USER, error: null });
    mockAdminSingle.mockResolvedValue({ data: MOCK_DB_USER, error: null });
    mockAuthGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile");
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when token is invalid", async () => {
    mockAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Invalid token") });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer invalid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid session" });
  });

  it("returns 404 when user profile is not found", async () => {
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User profile not found" });
  });

  it("returns profile bundle on success", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(MOCK_DB_USER.id);
    expect(body.username).toBe(MOCK_DB_USER.username);
    expect(body.ezygo_token).toBe("decrypted-encrypted-token");
    expect(body.class.name).toBe("Class 1");
  });

  it("performs profile sync when sync=true is provided", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile?sync=true", {
      headers: { authorization: "Bearer valid-token" }
    });
    
    // Mock for the refetch after sync
    mockAdminSingle.mockResolvedValueOnce({ data: { ...MOCK_DB_USER, username: "synced-user" }, error: null });

    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    expect(performProfileSync).toHaveBeenCalled();
    const body = await res.json();
    expect(body.username).toBe("synced-user");
  });

  it("handles sync failure gracefully", async () => {
    (performProfileSync as any).mockRejectedValueOnce(new Error("Sync error"));
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile?sync=true", {
      headers: { authorization: "Bearer valid-token" }
    });
    
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200); // Should still return 200 with existing data
    const body = await res.json();
    expect(body.username).toBe(MOCK_DB_USER.username);
  });

  it("handles decryption failures for PII fields", async () => {
    const MOCK_DB_USER_WITH_PII = {
      ...MOCK_DB_USER,
      phone: "enc-phone",
      phone_iv: "iv",
      gender: "enc-gender",
      gender_iv: "iv",
      birth_date: "enc-bd",
      birth_date_iv: "iv"
    };
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: MOCK_DB_USER_WITH_PII, error: null });
    (decrypt as any).mockImplementation((_iv: string, content: string) => {
      if (content === "enc-phone") throw new Error("Decryption failed");
      return `decrypted-${content}`;
    });

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone).toBeNull(); // Should be null on decryption failure
    expect(body.gender).toBe("decrypted-enc-gender");
  });

  it("returns 500 on unexpected database error", async () => {
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "DB error" } });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(500);
  });

  it("handles case where class is an array", async () => {
    const MOCK_DB_USER_ARRAY_CLASS = {
      ...MOCK_DB_USER,
      class: [{ id: "class-1", name: "Class 1" }]
    };
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: MOCK_DB_USER_ARRAY_CLASS, error: null });
    
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.class.name).toBe("Class 1");
  });

  it("handles user_settings fetch failure", async () => {
    // In our implementation, we use maybeSingle for settings too.
    // Let's mock the second call to 'from("user_settings")'
    const mockFrom = vi.fn().mockImplementation((table) => {
      if (table === "users") {
        return {
          select: mockAdminSelect.mockReturnThis(),
          eq: mockAdminEq.mockReturnThis(),
          maybeSingle: mockAdminMaybeSingle.mockResolvedValue({ data: MOCK_DB_USER, error: null }),
        };
      }
      if (table === "user_settings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "Settings error" } }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    (getAdminClient as any).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom
    });

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/user/profile", {
      headers: { authorization: "Bearer valid-token" }
    });
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should have default settings
    expect(body.settings.target_percentage).toBe(75);
  });
});
