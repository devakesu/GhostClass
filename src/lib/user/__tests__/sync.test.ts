import { describe, it, expect, vi, beforeEach } from "vitest";
import { performProfileSync } from "../sync";
import { egressFetch } from "@/lib/utils.server";
import { getAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    dev: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/utils.server", () => ({
  egressFetch: vi.fn(),
  redact: vi.fn((_k, v) => v),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((_iv, content) => content),
  encrypt: vi.fn((val) => ({ content: val, iv: "mock-iv" })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("performProfileSync", () => {
  const mockToken = "mock-token";
  const mockEzygoId = "12345";
  const mockAuthId = "auth-uuid";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully syncs profile with all data present", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "class-id" }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          first_name: "LocalFirst",
          last_name: "LocalLast",
          phone: "enc-phone",
          phone_iv: "iv",
          gender: "enc-gender",
          gender_iv: "iv",
          birth_date: "enc-dob",
          birth_date_iv: "iv",
          terms_version: "v1",
          class_id: "class-id",
        },
      }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return {
          ok: true,
          json: async () => ({
            user_id: 12345,
            full_name: "Remote Full Name",
            email: "test@example.com",
            gender: "Male",
            dob: "1990-01-01",
          }),
        } as any;
      }
      if (url === "user/setting/default_semester") {
        return { ok: true, text: async () => "1" } as any;
      }
      if (url === "user/setting/default_academic_year") {
        return { ok: true, text: async () => "2024-25" } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return {
          ok: true,
          json: async () => [
            {
              id: 101,
              code: "CS101",
              name: "Intro to CS",
              usersubgroup: {
                id: 999,
                name: "CS-A",
                usergroup: { id: 888 },
              },
            },
          ],
          clone: () => ({ text: async () => "[]" }),
        } as any;
      }
      if (url === "institutionuser/myroles") {
        return {
          ok: true,
          json: async () => ({ subgroupRoles: [] }),
        } as any;
      }
      return { ok: false } as any;
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);

    expect(result.id).toBe("12345");
    expect(result.profile.firstName).toBe("LocalFirst"); // Local takes priority if present
    expect(result.academic.semester).toBe("odd");
    expect(result.courses["CS101"]).toBeDefined();
    expect(mockSupabase.upsert).toHaveBeenCalled();
  });

  it("handles missing courses and roles", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return {
          ok: true,
          json: async () => ({ user_id: 12345, first_name: "Remote" }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const result = await performProfileSync(mockToken, "", mockAuthId);
    expect(result.profile.firstName).toBe("Remote");
    expect(result.class).toBeNull();
  });

  it("handles even semester and role-based class detection", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "class-id-from-role" }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345 }) } as any;
      }
      if (url === "user/setting/default_semester") {
        return { ok: true, text: async () => "2" } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: true, 
          json: async () => [],
          clone: () => ({ text: async () => "[]" }),
        } as any;
      }
      if (url === "institutionuser/myroles") {
        return {
          ok: true,
          json: async () => ({ 
            subgroupRoles: [{ id: 777, name: "RoleClass" }] 
          }),
        } as any;
      }
      return { 
        ok: true, 
        text: async () => "", 
        json: async () => ({}),
        clone: () => ({ text: async () => "" }),
      } as any;
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.academic.semester).toBe("even");
    expect(result.class?.name).toBe("RoleClass");
  });

  it("throws error if database upsert fails", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: { message: "DB Error" } }),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (_url: string) => {
      return { 
        ok: true, 
        json: async () => ({ user_id: 12345 }),
        clone: () => ({ text: async () => "{}" }),
      } as any;
    });

    await expect(performProfileSync(mockToken, mockEzygoId, mockAuthId)).rejects.toEqual({ message: "DB Error" });
  });

  it("throws if EzyGo ID is missing", async () => {
    vi.mocked(egressFetch).mockResolvedValue({ 
      ok: true, 
      json: async () => ({}) // No user_id
    } as any);
    await expect(performProfileSync(mockToken, "", mockAuthId)).rejects.toThrow("Missing EzyGo User ID");
  });

  it("handles courses JSON parse failure", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345 }) } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: true, 
          json: async () => { throw new Error("Parse Error"); },
          clone: () => ({ text: async () => "Invalid JSON" }),
          status: 200
        } as any;
      }
      return { ok: true, text: async () => "", json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.courses).toEqual({});
  });

  it("throws error if EzyGo profile fetch fails", async () => {
    vi.mocked(egressFetch).mockResolvedValue({ ok: false, status: 500 } as any);
    await expect(performProfileSync(mockToken, mockEzygoId, mockAuthId)).rejects.toThrow("EzyGo Profile failed: 500");
  });
});
