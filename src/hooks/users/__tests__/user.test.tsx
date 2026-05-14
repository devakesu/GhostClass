import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.unmock("../user");
import { useUser } from "../user";
import axiosInstance from "@/lib/axios";
import { handleLogout } from "@/lib/security/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@/lib/security/auth", () => ({
  handleLogout: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
};

describe("useUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch user successfully", async () => {
    const mockUser = { username: "testuser", email: "test@example.com" };
    (axiosInstance.get as any).mockResolvedValueOnce({ data: mockUser });

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockUser);
    expect(axiosInstance.get).toHaveBeenCalledWith("/user");
  });

  it("should handle null response and logout", async () => {
    (axiosInstance.get as any).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(handleLogout).toHaveBeenCalled();
  });

  it("should handle fetch error", async () => {
    (axiosInstance.get as any).mockRejectedValueOnce(new Error("Network Error"));

    const { result } = renderHook(() => useUser(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
