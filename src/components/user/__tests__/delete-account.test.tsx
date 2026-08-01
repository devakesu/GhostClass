import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteAccount } from "../delete-account";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { handleLogout } from "@/lib/security/auth";
import { toast } from "sonner";

// Mock dependencies
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(),
}));

vi.mock("@/lib/security/auth", () => ({
  handleLogout: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("DeleteAccount Component", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    storage: {
      from: vi.fn().mockReturnThis(),
      list: vi.fn(),
      remove: vi.fn(),
    },
    rpc: vi.fn(),
  };

  const mockQueryClient = {
    clear: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockSupabase as never);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as never);
  });

  it("renders correctly", () => {
    render(<DeleteAccount />);
    expect(screen.getAllByText("Delete Account").length).toBeGreaterThan(0);
  });

  it("opens dialog when delete button is clicked", async () => {
    render(<DeleteAccount />);
    fireEvent.click(screen.getByLabelText("Delete account"));
    expect(await screen.findByText("Are you absolutely sure?")).toBeDefined();
  });

  it("handles account deletion successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    mockSupabase.storage.list.mockResolvedValue({ data: [], error: null });
    mockSupabase.rpc.mockResolvedValue({ error: null });

    render(<DeleteAccount />);

    // Open dialog
    fireEvent.click(screen.getByLabelText("Delete account"));

    // Type DELETE
    const input = screen.getByPlaceholderText("DELETE");
    fireEvent.change(input, { target: { value: "DELETE" } });

    // Click confirm
    const confirmButton = screen.getByText("Permanently Delete");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith("delete_user_account");
      expect(toast.success).toHaveBeenCalledWith(
        "Account deleted successfully",
      );
      expect(mockQueryClient.clear).toHaveBeenCalled();
      expect(handleLogout).toHaveBeenCalled();
    });
  });

  it("handles deletion failure", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    mockSupabase.rpc.mockResolvedValue({
      error: { message: "Failed to delete" },
    });

    render(<DeleteAccount />);

    fireEvent.click(screen.getByLabelText("Delete account"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByText("Permanently Delete"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to delete");
    });
  });

  it("handles storage listing error gracefully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    mockSupabase.storage.list.mockResolvedValue({
      data: null,
      error: { message: "List failed" },
    });
    mockSupabase.rpc.mockResolvedValue({ error: null });
    const { logger } = await import("@/lib/logger");

    render(<DeleteAccount />);
    fireEvent.click(screen.getByLabelText("Delete account"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByText("Permanently Delete"));

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to list"),
        expect.any(Object),
      );
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });

  it("handles storage pagination correctly", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    // First page full, second page empty
    mockSupabase.storage.list
      .mockResolvedValueOnce({
        data: Array(100).fill({ name: "file.png" }),
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    mockSupabase.storage.remove.mockResolvedValue({ error: null });
    mockSupabase.rpc.mockResolvedValue({ error: null });

    render(<DeleteAccount />);
    fireEvent.click(screen.getByLabelText("Delete account"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByText("Permanently Delete"));

    await waitFor(() => {
      expect(mockSupabase.storage.list).toHaveBeenCalledTimes(2);
      expect(mockSupabase.storage.remove).toHaveBeenCalledWith(
        expect.arrayContaining(["user123/file.png"]),
      );
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });

  it("handles storage removal error gracefully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    mockSupabase.storage.list.mockResolvedValue({
      data: [{ name: "file.png" }],
      error: null,
    });
    mockSupabase.storage.remove.mockResolvedValue({
      error: { message: "Remove failed" },
    });
    mockSupabase.rpc.mockResolvedValue({ error: null });
    const { logger } = await import("@/lib/logger");

    render(<DeleteAccount />);
    fireEvent.click(screen.getByLabelText("Delete account"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByText("Permanently Delete"));

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to remove"),
        expect.any(Object),
      );
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });

  it("handles storage exceptions gracefully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    mockSupabase.storage.list.mockRejectedValue(new Error("Storage throw"));
    mockSupabase.rpc.mockResolvedValue({ error: null });
    const { logger } = await import("@/lib/logger");

    render(<DeleteAccount />);
    fireEvent.click(screen.getByLabelText("Delete account"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByText("Permanently Delete"));

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Unexpected error"),
        expect.any(Object),
      );
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });

  it("handles storage abort error specifically", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user123" } },
    });
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    mockSupabase.storage.list.mockRejectedValue(abortError);
    mockSupabase.rpc.mockResolvedValue({ error: null });
    const { logger } = await import("@/lib/logger");

    render(<DeleteAccount />);
    fireEvent.click(screen.getByLabelText("Delete account"));
    fireEvent.change(screen.getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(screen.getByText("Permanently Delete"));

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("aborted"),
        expect.any(Object),
      );
      expect(mockSupabase.rpc).toHaveBeenCalled();
    });
  });
});
