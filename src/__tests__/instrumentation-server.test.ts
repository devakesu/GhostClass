import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
}));

describe("instrumentation-server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("initializes Sentry with expected options", async () => {
    process.env.NEXT_PUBLIC_GIT_COMMIT_SHA = "abc 123 <tag>";
    await import("../instrumentation-server");
    expect(Sentry.init).toHaveBeenCalled();
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    // Test release sanitization
    expect(options.release).toBe("abc-123--tag-");
  });

  it("scrubs GA4 api_secret in breadcrumbs", async () => {
    await import("../instrumentation-server");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    const breadcrumb: any = {
      data: {
        url:
          "https://www.google-analytics.com/collect?api_secret=secret123&v=1",
      },
    };
    const processed: any = options.beforeBreadcrumb!(breadcrumb);
    expect(processed?.data?.url).toContain("api_secret=%5BFiltered%5D");
  });

  it("ignores non-GA4 URLs in breadcrumbs", async () => {
    await import("../instrumentation-server");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    const url = "https://example.com/api?api_secret=keep-me";
    const breadcrumb: any = { data: { url } };
    const processed: any = options.beforeBreadcrumb!(breadcrumb);
    expect(processed?.data?.url).toBe(url);
  });

  it("handles malformed URLs in scrubbing", async () => {
    await import("../instrumentation-server");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    const url = "not-a-url";
    const breadcrumb: any = { data: { url } };
    const processed: any = options.beforeBreadcrumb!(breadcrumb);
    expect(processed?.data?.url).toBe(url);
  });

  it("filters out network error types in beforeSend", async () => {
    await import("../instrumentation-server");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    const abortError = { message: "The request was aborted" };
    const result = options.beforeSend!(
      {} as any,
      { originalException: abortError } as any,
    );
    expect(result).toBeNull();

    const realError = { message: "Database crash" };
    const result2 = options.beforeSend!(
      {} as any,
      { originalException: realError } as any,
    );
    expect(result2).not.toBeNull();
  });

  it("scrubs auth headers in beforeSend", async () => {
    await import("../instrumentation-server");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    const event: any = {
      request: {
        headers: {
          "authorization": "Bearer secret",
          "cookie": "session=abc",
          "user-agent": "browser",
        },
      },
    };
    const result: any = options.beforeSend!(event, {} as any);
    expect(result?.request?.headers?.authorization).toBeUndefined();
    expect(result?.request?.headers?.cookie).toBeUndefined();
    expect(result?.request?.headers?.["user-agent"]).toBe("browser");
  });

  it("scrubs transactions", async () => {
    await import("../instrumentation-server");
    const options = vi.mocked(Sentry.init).mock.calls[0][0];

    const event: any = {
      spans: [
        {
          data: {
            "http.url": "https://google-analytics.com/collect?api_secret=123",
          },
        },
        {
          data: {
            "url": "https://google-analytics.com/collect?api_secret=456",
          },
        },
        { data: { "other": "no-change" } },
      ],
    };
    const result: any = options.beforeSendTransaction!(event as any, {} as any);
    expect(result?.spans?.[0]?.data?.["http.url"]).toContain("%5BFiltered%5D");
    expect(result?.spans?.[1]?.data?.["url"]).toContain("%5BFiltered%5D");
  });
});
