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

  it("throws if EzyGo profile returns invalid JSON (line 97)", async () => {
    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, status: 200, json: async () => null, clone: () => ({ text: async () => "" }) } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });
    await expect(performProfileSync(mockToken, mockEzygoId, mockAuthId)).rejects.toThrow("EzyGo Profile returned empty or invalid JSON: 200");
  });

  it("handles courses text read failure (line 111)", async () => {
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
          json: async () => [],
          clone: () => ({ 
            text: async () => { throw new Error("Clone failure"); } 
          }),
        } as any;
      }
      return { ok: true, text: async () => "", json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, mockEzygoId, mockAuthId);
    expect(result.updated).toBe(true);
  });

  it("resolves EzyGo ID from ezygoData.user.id if others are missing", async () => {
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
        return { ok: true, json: async () => ({ user: { id: "remote-user-id" } }), clone: () => ({ text: async () => "" }) } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "", mockAuthId);
    expect(result.id).toBe("remote-user-id");
  });

  it("exercises resolve helper with whitespace local string", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { first_name: "  ", last_name: "" } 
      }),
      or: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345, first_name: "RemoteFirst" }), clone: () => ({ text: async () => "" }) } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });
    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.profile.firstName).toBe("RemoteFirst");
  });

  it("handles class upsert error (line 197/217)", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Upsert failed" } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: true, 
          json: async () => [{ id: 1, usersubgroup: { id: 1, name: "Test" } }],
          clone: () => ({ text: async () => "[]" }),
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.class).toBeNull();
  });

  it("uses existing class_id as fallback in return (line 350)", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { class_id: "old-class-id" } 
      }),
      or: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.class?.id).toBe("old-class-id");
  });

  it("handles academic year object and 'even' semester string (line 154/160)", async () => {
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
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "user/setting/default_semester") {
        return { ok: true, text: async () => "even", clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "user/setting/default_academic_year") {
        const data = { default_academic_year: "2024-25" };
        return { 
          ok: true, 
          text: async () => JSON.stringify(data),
          json: async () => data, 
          clone: () => ({ text: async () => JSON.stringify(data) }) 
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.academic.semester).toBe("even");
    expect(result.academic.year).toBe("2024-25");
  });

  it("handles classData null with no classError (line 197/217)", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: true, 
          json: async () => [{ id: 1, usersubgroup: { id: 1, name: "Test" } }],
          clone: () => ({ text: async () => "[]" }),
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });
    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.class).toBeNull();
  });

  it("handles unknown semester and null academic year (line 147/158)", async () => {
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
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "user/setting/default_semester") {
        return { ok: true, text: async () => "unknown", clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "user/setting/default_academic_year") {
        return { ok: false, status: 404 } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.academic.semester).toBeNull();
    expect(result.academic.year).toBeNull();
  });

  it("handles courses ok:false and non-array coursesData (line 110/126)", async () => {
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
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: false, 
          status: 500,
          json: async () => ({ not: "an array" }),
          clone: () => ({ text: async () => "Error" })
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.courses).toEqual({});
  });

  it("handles zero course mappings (line 237)", async () => {
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
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: true, 
          json: async () => [{ id: null, code: null }], // Invalid courses for mapping
          clone: () => ({ text: async () => "[]" })
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.updated).toBe(true);
  });

  it("handles semester object (line 148)", async () => {
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
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "user/setting/default_semester") {
        const data = { default_semester: "odd" };
        return { 
          ok: true, 
          text: async () => JSON.stringify(data),
          json: async () => data, 
          clone: () => ({ text: async () => JSON.stringify(data) }) 
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.academic.semester).toBe("odd");
  });

  it("handles classError not null with classData not null (line 197/217 defensive)", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "some-id" }, error: { message: "Strange error" } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      or: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    vi.mocked(getAdminClient).mockReturnValue(mockSupabase as any);

    vi.mocked(egressFetch).mockImplementation(async (url: string) => {
      if (url === "myprofile") {
        return { ok: true, json: async () => ({ user_id: 12345 }), clone: () => ({ text: async () => "" }) } as any;
      }
      if (url === "institutionuser/courses/withusers") {
        return { 
          ok: true, 
          json: async () => [{ id: 1, usersubgroup: { id: 1, name: "Test" } }],
          clone: () => ({ text: async () => "[]" }),
        } as any;
      }
      return { ok: true, json: async () => ({}), clone: () => ({ text: async () => "" }) } as any;
    });

    const result = await performProfileSync(mockToken, "12345", mockAuthId);
    expect(result.class).toBeNull();
  });
});
