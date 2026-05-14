import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---
const { mockGetUser, mockFrom, mockMaybeSingle, mockSingle, mockCreateServerClient } = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    mockFrom: vi.fn(),
    mockMaybeSingle: vi.fn(),
    mockSingle: vi.fn(),
    mockCreateServerClient: vi.fn(),
  };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: any[]) => {
    const res = mockCreateServerClient(...args);
    if (res) return res;
    const options = args[2];
    if (options?.cookies) {
      // Call getAll to cover the branch in proxy.ts
      if (typeof options.cookies.getAll === 'function') options.cookies.getAll();
      // Call setAll to cover the branch in proxy.ts
      if (typeof options.cookies.setAll === 'function') options.cookies.setAll([{ name: 'test', value: 'val', options: {} }]);
    }
    
    return {
      auth: { getUser: mockGetUser },
      from: mockFrom,
    };
  },
}));

vi.mock("../lib/crypto", () => ({
  decrypt: vi.fn(() => "decrypted-token"),
}));

vi.mock("../lib/logger", () => ({
  logger: { 
    warn: vi.fn(), 
    error: vi.fn(), 
    dev: vi.fn(), 
    info: vi.fn() 
  },
}));

vi.mock("../lib/csp", () => ({
  getCspHeader: vi.fn(() => "default-src 'self'"),
}));

// Mock next/headers
// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock("../app/config/legal", () => ({
  TERMS_VERSION: "2.5",
}));

import { proxy } from "../proxy";

describe("proxy.ts coverage hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
      single: mockSingle,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("covers isApiDocs CSP branch", async () => {
    const request = new NextRequest("https://localhost/api-docs");
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    
    const response = await proxy(request);
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
  });

  it("covers development Supabase URL/Key branches", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_DEV_URL", "https://dev-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY", "dev-key");
    
    const request = new NextRequest("https://localhost/");
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    
    await proxy(request);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("covers getUserWithRetry transient error and successful retry", async () => {
    vi.useFakeTimers();
    mockGetUser
      .mockRejectedValueOnce(new Error("fetch failure"))
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    
    const request = new NextRequest("https://localhost/dashboard", {
      headers: { cookie: "terms_version=2.5" }
    });
    const proxyPromise = proxy(request);
    
    // Wait for the retry timeout
    await vi.runAllTimersAsync();
    const response = await proxyPromise;
    
    expect(mockGetUser).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    vi.useRealTimers();
  });

  it("covers getUserWithRetry transient error and failed retry", async () => {
    vi.useFakeTimers();
    mockGetUser
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Persistent failure"));
    
    const request = new NextRequest("https://localhost/dashboard", {
      headers: { cookie: "terms_version=2.5" }
    });
    const proxyPromise = proxy(request);
    
    await vi.runAllTimersAsync();
    const response = await proxyPromise;
    
    expect(mockGetUser).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(307); // Redirect to / due to auth failure
    vi.useRealTimers();
  });

  it("covers clearSessionCookies line 21 (sb- auth cookies)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    
    const request = new NextRequest("https://localhost/dashboard", {
      headers: {
        cookie: "sb-example-auth-token=value"
      }
    });
    
    const response = await proxy(request);
    expect(response.status).toBe(307);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some(c => c.includes("sb-example-auth-token=;"))).toBe(true);
  });

  it("covers proxy.ts line 180 unexpected throw", async () => {
    // Force getUserWithRetry to throw by making supabase.auth undefined
    // This is tricky because createServerClient is called inside proxy()
    // I'll mock createServerClient to return an object where auth is a getter that throws
    mockCreateServerClient.mockReturnValueOnce({
      get auth() { throw new Error("Unexpected auth failure"); },
      from: mockFrom
    });

    const request = new NextRequest("https://localhost/dashboard");
    const response = await proxy(request);
    
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://localhost/");
  });

  it("covers getUserWithRetry non-transient error", async () => {
    mockGetUser.mockRejectedValueOnce(new Error("Fatal error"));
    
    const request = new NextRequest("https://localhost/dashboard");
    const response = await proxy(request);
    
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
  });

  it("covers clearSessionCookies catch block", async () => {
    // We need to trigger a redirect for an unauthenticated user to hit clearSessionCookies
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    
    const request = new NextRequest("https://localhost/dashboard");
    
    // Mock getAll to throw after the first call (which happens in createServerClient)
    let callCount = 0;
    request.cookies.getAll = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount > 1) throw new Error("Cookie error");
      return [];
    });

    const response = await proxy(request);
    expect(response.status).toBe(307);
    // Should log warning but not crash
  });

  it("covers EzyGo session self-healing success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-healing" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ 
      data: { ezygo_token: "token", ezygo_iv: "iv" }, 
      error: null 
    });
    
    const request = new NextRequest("https://localhost/dashboard", {
      headers: { cookie: "terms_version=2.5" }
    });
    // No ezygo_access_token cookie in request
    
    const response = await proxy(request);
    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some(c => c.includes("ezygo_access_token=decrypted-token"))).toBe(true);
  });

  it("covers EzyGo session self-healing failure (DB error)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-healing-fail" } }, error: null });
    mockMaybeSingle.mockRejectedValue(new Error("DB error"));
    
    const request = new NextRequest("https://localhost/dashboard", {
      headers: { cookie: "terms_version=2.5" }
    });
    const response = await proxy(request);
    expect(response.status).toBe(200);
    // Should not crash
  });

  it("covers terms_redirect_count protection loop (Scenario B)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-loop" } }, error: null });
    mockSingle.mockResolvedValue({ data: { terms_version: "1.0" }, error: null });
    
    const request = new NextRequest("https://localhost/dashboard", {
      headers: {
        cookie: "terms_redirect_count=3"
      }
    });
    
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://localhost/");
  });

  it("covers isRefreshTokenNotFoundError with status 400 and message branch", async () => {
    mockGetUser.mockRejectedValueOnce({
      status: 400,
      message: "Invalid Refresh Token"
    });
    
    const request = new NextRequest("https://localhost/dashboard");
    const response = await proxy(request);
    expect(response.status).toBe(307);
  });

  it("covers getUserWithRetry status codes 502, 503, 504", async () => {
    vi.useFakeTimers();
    for (const status of [502, 503, 504]) {
      mockGetUser.mockClear();
      mockGetUser
        .mockRejectedValueOnce({ status, message: "Gateway error" })
        .mockResolvedValueOnce({ data: { user: { id: "user-retry" } }, error: null });
      
      const request = new NextRequest("https://localhost/dashboard");
      const proxyPromise = proxy(request);
      await vi.runAllTimersAsync();
      await proxyPromise;
      expect(mockGetUser).toHaveBeenCalledTimes(2);
    }
    vi.useRealTimers();
  });
});
