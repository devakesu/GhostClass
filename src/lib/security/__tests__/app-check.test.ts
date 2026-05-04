/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isMobileRequest, verifyAppCheckToken, withSecurity } from "../app-check";
import { headers } from "next/headers";
import { getAppCheck } from "@/lib/firebase/admin";
import { verifyPlayIntegrity } from "@/lib/security/integrity";
import { decryptRequest, encryptResponse } from "@/lib/security/jwe";
import * as Sentry from "@sentry/nextjs";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(() => ({
    get: vi.fn(),
  })),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAppCheck: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/security/integrity", () => ({
  verifyPlayIntegrity: vi.fn(),
}));

vi.mock("@/lib/security/jwe", () => ({
  decryptRequest: vi.fn(),
  encryptResponse: vi.fn(),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateCsrfToken: vi.fn(() => Promise.resolve(true)),
  getCsrfToken: vi.fn(),
}));

vi.mock("@/lib/security/device-check", () => ({
  verifyDeviceCheckToken: vi.fn(),
}));

vi.mock("@/lib/utils.server", () => ({
  getClientIp: vi.fn(() => "192.168.1.1"),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
  },
}));

describe("App Check Security", () => {
  const mockSecret = "secret-key-123456789012345678901234";
  const validAppId = "1:424804867878:android:015bb34927f1dd8e21abe7";
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MOBILE_API_SECRET", mockSecret);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_APP_ID_ANDROID", validAppId);
    vi.stubEnv("ENFORCE_APP_CHECK", "false");
    vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isMobileRequest", () => {
    it("returns true for matching api key", () => {
      const h = new Headers({ "x-mobile-api-key": mockSecret });
      expect(isMobileRequest(h)).toBe(true);
    });

    it("returns false for mismatched api key", () => {
      const h = new Headers({ "x-mobile-api-key": "wrong-secret" });
      expect(isMobileRequest(h)).toBe(false);
    });

    it("returns false if secret is missing", () => {
      vi.stubEnv("MOBILE_API_SECRET", "");
      const h = new Headers({ "x-mobile-api-key": mockSecret });
      expect(isMobileRequest(h)).toBe(false);
    });
  });

  describe("verifyAppCheckToken", () => {
    const validToken = "app-check-token";

    it("handles development mode bypass (ENFORCE_PLAY_INTEGRITY false)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "false");
      const h = new Headers();
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("uses nextHeaders if req is not provided", async () => {
      const h = new Headers();
      (headers as any).mockResolvedValue(h);
      const result = await verifyAppCheckToken();
      expect(result.isValid).toBe(true);
    });
    
    it("allows mobile requests without a token when App Check enforcement is off", async () => {
      const h = new Headers({ "x-mobile-api-key": mockSecret });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("respects the env flag for mobile requests with no token", async () => {
      vi.stubEnv("MOBILE_API_SECRET", "secret");
      
      const h = new Headers({ "x-mobile-api-key": "secret" });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("hits line 207 branch with nested payload.rcek", async () => {
      // withSecurity header-only JWE branch
      (decryptRequest as any).mockResolvedValue({ payload: { rcek: "secret-cek" } });
      const handler = vi.fn().mockResolvedValue(new Response("ok"));
      const secureHandler = withSecurity(handler);
      
      const req = new Request("http://localhost", { 
        headers: { 
          "X-JWE-Key": "some-jwe",
          "x-csrf-token": "valid-csrf-token" 
        } 
      });
      await secureHandler(req, {});
      expect(handler).toHaveBeenCalled();
    });

    it("hits line 207 branch with direct rcek", async () => {
      (decryptRequest as any).mockResolvedValue({ rcek: "direct-cek" });
      const handler = vi.fn().mockResolvedValue(new Response("ok"));
      const secureHandler = withSecurity(handler);
      
      const req = new Request("http://localhost", { 
        headers: { 
          "X-JWE-Key": "some-jwe",
          "x-csrf-token": "valid-csrf-token" 
        } 
      });
      await secureHandler(req, {});
      expect(handler).toHaveBeenCalled();
    });

    it("verifies valid token successfully", async () => {
      const h = new Headers({ "X-Firebase-AppCheck": validToken });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("logs error and returns valid if Firebase Admin not initialized", async () => {
      const h = new Headers({ "X-Firebase-AppCheck": validToken });
      (getAppCheck as any).mockReturnValue(null);
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
      expect(result.alreadyLogged).toBe(true);
    });

    it("rejects unauthorized App ID", async () => {
      const h = new Headers({ "X-Firebase-AppCheck": validToken });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: "wrong-app-id" })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Unauthorized App ID");
    });

    it("verifies Play Integrity when token is present", async () => {
      const h = new Headers({ 
        "X-Firebase-AppCheck": validToken,
        "X-Play-Integrity": "p-token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      (verifyPlayIntegrity as any).mockResolvedValue({ isValid: true });

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
      expect(verifyPlayIntegrity).toHaveBeenCalledWith("p-token", expect.any(String));
    });

    it("fails if Play Integrity verification fails", async () => {
      const h = new Headers({ 
        "X-Firebase-AppCheck": validToken,
        "X-Play-Integrity": "p-token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      (verifyPlayIntegrity as any).mockResolvedValue({ isValid: false, error: "bad device" });

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("bad device");
    });

    it("enforces Play Integrity for Android in production (ENFORCE_PLAY_INTEGRITY true branch)", async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "true");
      const h = new Headers({ 
        "X-Firebase-AppCheck": validToken,
        "user-agent": "Android"
        // NOT a mobile app (no x-mobile-api-key)
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing mandatory integrity attestation");
    });

    it("uses default values for App IDs and error messages", async () => {
      vi.stubEnv("FIREBASE_APP_ID_ANDROID", "");
      vi.stubEnv("FIREBASE_APP_ID_IOS", "");
      const h = new Headers({ 
        "X-Firebase-AppCheck": validToken,
        "X-Play-Integrity": "p-token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: "1:424804867878:android:015bb34927f1dd8e21abe7" })
      });
      (verifyPlayIntegrity as any).mockResolvedValue({ isValid: false }); // No error message

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Device integrity check failed");
    });

    it("handles verifyToken exception", async () => {
      const h = new Headers({ "X-Firebase-AppCheck": validToken });
      const err = new Error("Firebase fail");
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockRejectedValue(err)
      });

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid App Check token");
      expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.any(Object));
    });
  });

  describe("withSecurity", () => {
    const setupValidAppCheck = () => {
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
    };

    it("returns 401 if auth fails and enforced", async () => {
      vi.stubEnv("ENFORCE_APP_CHECK", "true");
      const wrapped = withSecurity(vi.fn());
      const req = new Request("http://l", { headers: {} });
      const res = await wrapped(req, {});
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid JWE structure", async () => {
      setupValidAppCheck();
      const wrapped = withSecurity(vi.fn());
      const req = new Request("http://l", {
        method: "POST",
        headers: { "content-type": "application/jose", "X-Firebase-AppCheck": "t" },
        body: "not.enough.dots"
      });
      const res = await wrapped(req, {});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid secure payload structure" });
    });

    it("handles nested JWE structure {payload, rcek}", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        method: "POST",
        headers: { "content-type": "application/jose", "X-Firebase-AppCheck": "t" },
        body: "a.b.c.d.e"
      });
      (decryptRequest as any).mockResolvedValue({ payload: { data: "inner" }, rcek: "cek" });

      await wrapped(req, {});
      expect(mockHandler).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ decryptedBody: { data: "inner" } }));
    });

    it("handles flat JWE structure with null decrypted", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        method: "POST",
        headers: { "content-type": "application/jose", "X-Firebase-AppCheck": "t" },
        body: "a.b.c.d.e"
      });
      (decryptRequest as any).mockResolvedValue(null);

      await wrapped(req, {});
      expect(mockHandler).toHaveBeenCalled();
    });

    it("handles nested JWE structure {payload, rcek} with missing rcek", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        method: "POST",
        headers: { "content-type": "application/jose", "X-Firebase-AppCheck": "t" },
        body: "a.b.c.d.e"
      });
      (decryptRequest as any).mockResolvedValue({ payload: { data: "inner" } }); // missing rcek

      await wrapped(req, {});
      expect(mockHandler).toHaveBeenCalled();
    });

    it("handles flat JWE structure with non-object decrypted", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        method: "POST",
        headers: { "content-type": "application/jose", "X-Firebase-AppCheck": "t" },
        body: "a.b.c.d.e"
      });
      (decryptRequest as any).mockResolvedValue("string-decrypted");

      await wrapped(req, {});
      expect(mockHandler).toHaveBeenCalled();
    });

    it("handles header-only JWE (X-JWE-Key) with complex fallbacks", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        headers: { "X-JWE-Key": "a.b.c.d.e", "X-Firebase-AppCheck": "t" }
      });
      // Test the (decrypted.rcek || decrypted.payload?.rcek || null) fallback
      (decryptRequest as any).mockResolvedValue({ payload: { data: "no-rcek" } });

      await wrapped(req, {});
      expect(mockHandler).toHaveBeenCalled();
    });

    it("handles deeply nested rcek in header-only JWE", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        headers: { "X-JWE-Key": "a.b.c.d.e", "X-Firebase-AppCheck": "t" }
      });
      (decryptRequest as any).mockResolvedValue({ payload: { rcek: "deep-nested-cek" } });

      await wrapped(req, {});
      expect(mockHandler).toHaveBeenCalled();
    });

    it("skips mobile enforcement if not in production", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const h = new Headers({ "x-mobile-api-key": mockSecret });
      // No token, but not in prod
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("skips mobile enforcement if token is present", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const h = new Headers({ 
        "x-mobile-api-key": mockSecret,
        "X-Firebase-AppCheck": "token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("handles non-mobile request in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const h = new Headers({ "X-Firebase-AppCheck": "token" });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("skips integrity enforcement for Android if not mobile and not enforced", async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "false");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token",
        "user-agent": "Android"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("skips Play Integrity enforcement for non-Android/non-prod", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token",
        "user-agent": "iOS" // Not Android
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });

      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it("handles JWE decryption catch block", async () => {
      setupValidAppCheck();
      const wrapped = withSecurity(vi.fn());
      const req = new Request("http://l", {
        headers: { "X-JWE-Key": "a.b.c.d.e", "X-Firebase-AppCheck": "t" }
      });
      (decryptRequest as any).mockRejectedValue(new Error("Decryption failed"));

      const res = await wrapped(req, {});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Security Handshake Failed" });
    });

    it("returns 500 if handler returns null", async () => {
      setupValidAppCheck();
      const wrapped = withSecurity(vi.fn().mockResolvedValue(null));
      const req = new Request("http://l", { headers: { "X-Firebase-AppCheck": "t" } });
      const res = await wrapped(req, {});
      expect(res.status).toBe(500);
    });

    it("encrypts response JSON payload", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: "success" })));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        headers: { "X-JWE-Key": "a.b.c.d.e", "X-Firebase-AppCheck": "t" }
      });
      (decryptRequest as any).mockResolvedValue({ rcek: "valid-cek" });
      (encryptResponse as any).mockResolvedValue("encrypted-resp");

      const res = await wrapped(req, {});
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("encrypted-resp");
      expect(res.headers.get("content-type")).toBe("application/jose");
    });

    it("encrypts raw text response", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("raw-text"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        headers: { "X-JWE-Key": "a.b.c.d.e", "X-Firebase-AppCheck": "t" }
      });
      (decryptRequest as any).mockResolvedValue({ rcek: "valid-cek" });
      (encryptResponse as any).mockResolvedValue("encrypted-raw");

      const res = await wrapped(req, {});
      expect(await res.text()).toBe("encrypted-raw");
    });

    it("returns 500 if response encryption fails", async () => {
      setupValidAppCheck();
      const mockHandler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(mockHandler);
      const req = new Request("http://l", {
        headers: { "X-JWE-Key": "a.b.c.d.e", "X-Firebase-AppCheck": "t" }
      });
      (decryptRequest as any).mockResolvedValue({ rcek: "valid-cek" });
      (encryptResponse as any).mockRejectedValue(new Error("Enc fail"));

      const res = await wrapped(req, {});
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Secure Transmission Failed" });
    });
  });

  describe("Branch Coverage", () => {
    it("requires token when App Check enforcement is enabled", async () => {
      vi.stubEnv("ENFORCE_APP_CHECK", "true");
      vi.stubEnv("MOBILE_API_SECRET", "secret");
      
      const req = new Request("http://localhost", {
        headers: { "x-mobile-api-key": "secret" }
      });
      
      const result = await verifyAppCheckToken(req);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing mandatory App Check token");
    });

    it("handles JWE without nested payload property in withSecurity", async () => {
      const { decryptRequest } = await import("@/lib/security/jwe");
      (decryptRequest as any).mockResolvedValue({ rcek: "test-cek", some: "data" });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      
      const handler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(handler);
      
      const req = new Request("http://localhost", {
        method: "POST",
        headers: { 
          "content-type": "application/jose",
          "X-Firebase-AppCheck": "app-check-token"
        },
        body: "a.b.c.d.e"
      });
      
      await wrapped(req, {});
      expect(handler).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          decryptedBody: expect.objectContaining({ rcek: "test-cek" }),
          authType: "app-check"
      }));
    });

    it("handles JWE header without nested payload in withSecurity", async () => {
      const { decryptRequest } = await import("@/lib/security/jwe");
      (decryptRequest as any).mockResolvedValue({ some: "data" }); // No rcek at all
      
      const handler = vi.fn().mockResolvedValue(new Response("ok"));
      const wrapped = withSecurity(handler);
      
      const req = new Request("http://localhost", {
        headers: { 
          "X-JWE-Key": "a.b.c.d.e",
          "x-csrf-token": "valid-token"
        }
      });
      
      await wrapped(req, {});
      expect(handler).toHaveBeenCalled();
    });

    it("handles JWE header with deeply nested rcek in withSecurity", async () => {
        const { decryptRequest } = await import("@/lib/security/jwe");
        (decryptRequest as any).mockResolvedValue({ payload: { rcek: "deep-cek" } });
        
        const handler = vi.fn().mockResolvedValue(new Response("ok"));
        const wrapped = withSecurity(handler);
        
        const req = new Request("http://localhost", {
          headers: { 
            "X-JWE-Key": "a.b.c.d.e",
            "x-csrf-token": "valid-token"
          }
        });
        
        await wrapped(req, {});
      expect(handler).toHaveBeenCalled();
    });

    it("handles JWE header with string result in withSecurity", async () => {
        const { decryptRequest } = await import("@/lib/security/jwe");
        (decryptRequest as any).mockResolvedValue("just-a-string");
        
        const handler = vi.fn().mockResolvedValue(new Response("ok"));
        const wrapped = withSecurity(handler);
        
        const req = new Request("http://localhost", {
          headers: { 
            "X-JWE-Key": "a.b.c.d.e",
            "x-csrf-token": "valid-token"
          }
        });
        
        await wrapped(req, {});
      expect(handler).toHaveBeenCalled();
    });

    it('allows mobile requests in production with valid token', async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("MOBILE_API_SECRET", "secret");
      
      const req = new Request("http://localhost", {
        headers: { 
          "x-mobile-api-key": "secret",
          "X-Firebase-AppCheck": "valid-token"
        }
      });
      
      // Mock getAppCheck().verifyToken to succeed
      const { getAppCheck } = await import("@/lib/firebase/admin");
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: "1:424804867878:android:015bb34927f1dd8e21abe7" })
      });

      const result = await verifyAppCheckToken(req);
      expect(result.isValid).toBe(true);
    });

    it('covers missing permutations for line 67 (isMobileApp=false, isProd=true, token=null)', async () => {
      vi.stubEnv("NODE_ENV", "production");
      const h = new Headers(); // No x-mobile-api-key
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it('covers development mode with ENFORCE_PLAY_INTEGRITY=true', async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "true");
      const h = new Headers();
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it('allows mobile request when App Check is valid and ENFORCE_PLAY_INTEGRITY is off', async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "false");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });

    it('enforces Play Integrity when App Check present and ENFORCE_PLAY_INTEGRITY=true (mobile request)', async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "true");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing mandatory integrity attestation");
    });
    it('mobile request with ENFORCE_PLAY_INTEGRITY=true but missing Play Integrity token fails', async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "true");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing mandatory integrity attestation");
    });

    it('any App Check request with ENFORCE_PLAY_INTEGRITY=true requires Play Integrity (no user-agent spoofing bypass)', async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "true");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" // Spoof as web
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Missing mandatory integrity attestation");
    });

    it('mobile request succeeds when ENFORCE_PLAY_INTEGRITY=false (even without token)', async () => {
      vi.stubEnv("ENFORCE_PLAY_INTEGRITY", "false");
      const h = new Headers({ 
        "X-Firebase-AppCheck": "token"
      });
      (getAppCheck as any).mockReturnValue({
        verifyToken: vi.fn().mockResolvedValue({ appId: validAppId })
      });
      const result = await verifyAppCheckToken({ headers: h } as Request);
      expect(result.isValid).toBe(true);
    });
  });
});
