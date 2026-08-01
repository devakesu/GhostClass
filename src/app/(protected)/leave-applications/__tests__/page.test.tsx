import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaveApplicationsPage from "../page";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).url = url;
    throw error;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("../LeaveDataLoader", () => ({
  LeaveDataLoader: () => <div data-testid="data-loader">DataLoader</div>,
}));

vi.mock("@/lib/logger", () => ({
  logger: { dev: vi.fn(), warn: vi.fn() },
}));

describe("LeaveApplicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid-token" }),
    } as any);
  });

  it("redirects to root if user is not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("Auth error"),
        }),
      },
    } as any);

    try {
      await LeaveApplicationsPage();
    } catch (e: any) {
      expect(e.url).toBe("/");
    }
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("redirects to root if ezygo token is missing", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "123" } },
          error: null,
        }),
      },
    } as any);
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as any);

    try {
      await LeaveApplicationsPage();
    } catch (e: any) {
      expect(e.url).toBe("/");
    }
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders data loader if authenticated and token exists", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "123" } },
          error: null,
        }),
      },
    } as any);
    // Already mocked in beforeEach

    const result = await LeaveApplicationsPage();
    render(result);

    expect(screen.getByText("Leave Applications")).toBeInTheDocument();
    expect(screen.getByTestId("data-loader")).toBeInTheDocument();
  });
});
