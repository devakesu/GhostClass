import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("email.ts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(global, "fetch").mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  const mockProps = {
    to: "test@example.com",
    subject: "Test Subject",
    html: "<p>Hello</p>",
  };

  it("returns failure if NEXT_PUBLIC_APP_EMAIL is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "");
    vi.stubEnv("BREVO_API_KEY", "mock-key");
    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);
    expect(result.success).toBe(false);
    expect(result.error).toContain("NEXT_PUBLIC_APP_EMAIL is not configured");
  });

  it("sends via Brevo when only Brevo is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("BREVO_API_KEY", "brevo-key");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "");
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: "brevo-123" })
    });

    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);

    expect(result.success).toBe(true);
    expect(result.provider).toBe("Brevo");
    expect(result.id).toBe("brevo-123");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("brevo"), expect.objectContaining({
      headers: expect.objectContaining({ "api-key": "brevo-key" })
    }));
  });

  it("sends via SendPulse when only SendPulse is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "sp-id");
    vi.stubEnv("SENDPULSE_CLIENT_SECRET", "sp-secret");

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: "sp-token" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "sp-123" }) });
    });

    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);

    expect(result.success).toBe(true);
    expect(result.provider).toBe("SendPulse");
    expect(result.id).toBe("sp-123");
  });

  it("fails over to secondary if primary fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("BREVO_API_KEY", "brevo-key");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "sp-id");
    vi.stubEnv("SENDPULSE_CLIENT_SECRET", "sp-secret");

    // Force randomization to start with SendPulse
    vi.spyOn(Math, "random").mockReturnValue(0.1); 

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("sendpulse")) {
        // Fail primary
        return Promise.resolve({ ok: false, status: 500 });
      }
      if (url.includes("brevo")) {
        // Succeed secondary
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ messageId: "brevo-failover" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: "t" }) });
    });

    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);

    expect(result.success).toBe(true);
    expect(result.provider).toBe("Brevo");
    expect(result.id).toBe("brevo-failover");
  });

  it("returns failure if all providers fail", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("BREVO_API_KEY", "brevo-key");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "sp-id");
    vi.stubEnv("SENDPULSE_CLIENT_SECRET", "sp-secret");

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);

    expect(result.success).toBe(false);
    expect(result.error).toContain("All email providers failed");
  });

  it("throws error if no provider is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "");

    const { sendEmail } = await import("../email");
    await expect(sendEmail(mockProps)).rejects.toThrow("No email provider configured");
  });

  it("handles SendPulse token fetch failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "sp-id");
    vi.stubEnv("SENDPULSE_CLIENT_SECRET", "sp-secret");

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth")) return Promise.resolve({ ok: false });
      return Promise.resolve({ ok: true });
    });

    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);
    expect(result.success).toBe(false);
    expect(result.error).toContain("SendPulse Auth Failed");
  });

  it("handles SendPulse API error with message", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_EMAIL", "example.com");
    vi.stubEnv("SENDPULSE_CLIENT_ID", "sp-id");
    vi.stubEnv("SENDPULSE_CLIENT_SECRET", "sp-secret");

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: "t" }) });
      return Promise.resolve({ 
          ok: false, 
          status: 400, 
          json: () => Promise.resolve({ message: "SP Error Message" }) 
      });
    });

    const { sendEmail } = await import("../email");
    const result = await sendEmail(mockProps);
    expect(result.error).toContain("SP Error Message");
  });

  it('handles load balancer starting with Brevo', async () => {
    vi.stubEnv('BREVO_API_KEY', 'brevo-key');
    vi.stubEnv('SENDPULSE_CLIENT_ID', 'sp-id');
    vi.stubEnv('SENDPULSE_CLIENT_SECRET', 'sp-secret');
    
    // Mock Math.random to return > 0.5 (starts with Brevo)
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    
    global.fetch = vi.fn().mockResolvedValue({ 
      ok: true, 
      status: 200, 
      json: async () => ({ messageId: '123' }) 
    });
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    
    expect(res.provider).toBe("Brevo");
    vi.spyOn(Math, 'random').mockRestore();
  });

  it('handles provider API error with missing message', async () => {
    vi.stubEnv('BREVO_API_KEY', 'brevo-key');
    vi.stubEnv('SENDPULSE_CLIENT_ID', '');
    
    // Mock res.json() to throw, triggering the .catch(() => ({})) branch
    global.fetch = vi.fn().mockResolvedValue({ 
      ok: false, 
      status: 500, 
      json: async () => { throw new Error("JSON error"); } 
    });
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    expect(res.error).toContain("Brevo API error: 500");
  });

  it('handles unknown error in provider catch', async () => {
    vi.stubEnv('BREVO_API_KEY', 'brevo-key');
    vi.stubEnv('SENDPULSE_CLIENT_ID', '');
    
    global.fetch = vi.fn().mockImplementation(() => { throw new Error("String error"); });
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    expect(res.error).toContain("String error");
  });

  it('handles total failure of both providers with error message fallback', async () => {
    vi.stubEnv('BREVO_API_KEY', 'brevo-key');
    vi.stubEnv('SENDPULSE_CLIENT_ID', 'sp-id');
    vi.stubEnv('SENDPULSE_CLIENT_SECRET', 'sp-secret');
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // Start with SendPulse
    
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("SP primary fail")) // SP fail
      .mockRejectedValueOnce(new Error("SP auth fail")) // SP auth fail for primary
      .mockRejectedValueOnce(new Error("Brevo secondary fail")); // Brevo fail
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    
    expect(res.success).toBe(false);
    expect(res.error).toContain("All email providers failed");
    vi.spyOn(Math, 'random').mockRestore();
  });

  it('handles primary failure with no secondary available', async () => {
    vi.resetModules();
    vi.stubEnv('BREVO_API_KEY', 'brevo-key');
    vi.stubEnv('SENDPULSE_CLIENT_ID', '');
    
    global.fetch = vi.fn().mockRejectedValue(new Error("Primary fail only"));
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    
    expect(res.success).toBe(false);
    expect(res.error).toBe("Primary fail only");
  });

  it('uses provided text instead of sanitizing html', async () => {
    vi.resetModules();
    vi.stubEnv('BREVO_API_KEY', 'brevo-key');
    vi.stubEnv('SENDPULSE_CLIENT_ID', '');
    
    global.fetch = vi.fn().mockResolvedValue({ 
      ok: true, 
      status: 200, 
      json: async () => ({ messageId: '123' }) 
    });
    
    const { sendEmail } = await import("../email");
    await sendEmail({ ...mockProps, text: 'Custom Text' });
    
    const payload = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(payload.textContent).toBe('Custom Text');
  });

  it('uses provided text instead of sanitizing html (SendPulse)', async () => {
    vi.resetModules();
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('SENDPULSE_CLIENT_ID', 'sp-id');
    vi.stubEnv('SENDPULSE_CLIENT_SECRET', 'sp-secret');
    
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: "t" }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: '123' }) });
    });
    
    const { sendEmail } = await import("../email");
    await sendEmail({ ...mockProps, text: 'Custom Text SP' });
    
    const payload = JSON.parse((global.fetch as any).mock.calls[1][1].body);
    expect(payload.email.text).toBe('Custom Text SP');
  });

  it('throws if APP_EMAIL is missing', async () => {
    vi.resetModules();
    vi.stubEnv('BREVO_API_KEY', 'key');
    vi.stubEnv('NEXT_PUBLIC_APP_EMAIL', '');
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    expect(res.success).toBe(false);
    expect(res.error).toBe("NEXT_PUBLIC_APP_EMAIL is not configured");
  });

  it('works with SendPulse only', async () => {
    vi.resetModules();
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('SENDPULSE_CLIENT_ID', 'sp-id');
    vi.stubEnv('SENDPULSE_CLIENT_SECRET', 'sp-secret');
    
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("oauth")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: "t" }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: '123' }) });
    });
    
    const { sendEmail } = await import("../email");
    const res = await sendEmail(mockProps);
    expect(res.provider).toBe("SendPulse");
  });

  it('throws if no providers are configured', async () => {
    vi.resetModules();
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('SENDPULSE_CLIENT_ID', '');
    vi.stubEnv('SENDPULSE_CLIENT_SECRET', '');
    
    const { sendEmail } = await import("../email");
    await expect(sendEmail(mockProps)).rejects.toThrow("No email provider configured");
  });
});
