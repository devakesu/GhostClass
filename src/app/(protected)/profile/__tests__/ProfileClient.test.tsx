import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import ProfileClient from "../ProfileClient";
import { useProfile } from "@/hooks/users/profile";
import { uploadUserAvatar } from "@/hooks/users/upload-avatar";
import { toast } from "sonner";
import { compressImage } from "@/lib/utils";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/hooks/users/profile", () => ({
  useProfile: vi.fn(),
}));

vi.mock("@/hooks/users/upload-avatar", () => ({
  uploadUserAvatar: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    dev: vi.fn(),
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  compressImage: vi.fn(),
  redact: vi.fn((_type, val) => `redacted-${val}`),
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TabsContext = React.createContext({
  value: "",
  setValue: (_val: string) => {},
});

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, defaultValue }: any) => {
    const [value, setValue] = React.useState(defaultValue);
    return (
      <TabsContext.Provider value={{ value, setValue }}>
        {children}
      </TabsContext.Provider>
    );
  },
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => {
    const { setValue } = React.useContext(TabsContext);
    return <button onClick={() => setValue(value)}>{children}</button>;
  },
  TabsContent: ({ children, value }: any) => {
    const { value: activeValue } = React.useContext(TabsContext);
    return activeValue === value ? <div>{children}</div> : null;
  },
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    main: ({ children }: any) => <main>{children}</main>,
    div: ({ children }: any) => <div>{children}</div>,
    h3: ({ children }: any) => <h3>{children}</h3>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/components/user/profile-form", () => ({
  ProfileForm: () => <div data-testid="profile-form">ProfileForm</div>,
}));

vi.mock("@/components/institution-selector", () => ({
  InstitutionSelector: () => (
    <div data-testid="institution-selector">InstitutionSelector</div>
  ),
}));

vi.mock("@/components/loading", () => ({
  Loading: () => <div data-testid="loading">Loading</div>,
}));

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:test");
global.URL.revokeObjectURL = vi.fn();

describe("ProfileClient", () => {
  const mockProfile = {
    id: "123",
    username: "testuser",
    first_name: "Test",
    last_name: "User",
    email: "test@example.com",
    avatar_url: "http://example.com/avatar.jpg",
    created_at: "2023-01-01T00:00:00Z",
    phone: "911234567890",
    class: { name: "Class 10" },
    ezygo_created_at: "2023-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state when profile is loading", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: null, isLoading: true } as any,
    );
    render(<ProfileClient />);
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("renders profile data correctly", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);

    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("@testuser")).toBeInTheDocument();
    expect(screen.getByTestId("profile-form")).toBeInTheDocument();
    expect(screen.getByTestId("institution-selector")).toBeInTheDocument();
  });

  it("handles avatar upload successfully", async () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false, refetch: vi.fn() } as any,
    );
    vi.mocked(uploadUserAvatar).mockResolvedValue(
      "http://example.com/new-avatar.jpg",
    );

    render(<ProfileClient />);

    const file = new File(["dummy content"], "test.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload profile picture");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadUserAvatar).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Profile picture updated!");
    });
  });

  it("handles avatar upload failure", async () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false, refetch: vi.fn() } as any,
    );
    vi.mocked(uploadUserAvatar).mockRejectedValue(new Error("Upload Failed"));

    render(<ProfileClient />);

    const file = new File(["dummy content"], "test.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload profile picture");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("error while updating your profile picture"),
      );
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  it("switches tabs correctly", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);

    expect(screen.getByText("Personal Information")).toBeInTheDocument();

    fireEvent.click(screen.getByText("EzyGo"));
    expect(screen.getByText("EzyGo Account")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Personal"));
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
  });

  it("shows error toast when profile ID is missing during upload", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: { ...mockProfile, id: null }, isLoading: false } as any,
    );
    render(<ProfileClient />);

    const file = new File(["dummy content"], "test.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload profile picture");
    fireEvent.change(input, { target: { files: [file] } });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("verify your profile"),
    );
  });

  it("shows error toast for non-image file type", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);

    const file = new File(["dummy content"], "test.txt", {
      type: "text/plain",
    });
    const input = screen.getByLabelText("Upload profile picture");
    fireEvent.change(input, { target: { files: [file] } });

    expect(toast.error).toHaveBeenCalledWith("Please upload an image file.");
  });

  it("compresses large images before upload", async () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false, refetch: vi.fn() } as any,
    );
    vi.mocked(uploadUserAvatar).mockResolvedValue(
      "http://example.com/new-avatar.jpg",
    );

    const largeFile = new File([new Uint8Array(6 * 1024 * 1024)], "large.png", {
      type: "image/png",
    });
    const compressedFile = new File(
      [new Uint8Array(1 * 1024 * 1024)],
      "large.jpg",
      { type: "image/jpeg" },
    );
    vi.mocked(compressImage).mockResolvedValue(compressedFile);

    render(<ProfileClient />);
    const input = screen.getByLabelText("Upload profile picture");
    fireEvent.change(input, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining("Compressing"),
        expect.anything(),
      );
      expect(compressImage).toHaveBeenCalled();
      expect(uploadUserAvatar).toHaveBeenCalledWith(compressedFile);
    });
  });

  it("handles compression error by uploading original and warning user", async () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false, refetch: vi.fn() } as any,
    );
    vi.mocked(uploadUserAvatar).mockResolvedValue(
      "http://example.com/new-avatar.jpg",
    );

    const largeFile = new File([new Uint8Array(6 * 1024 * 1024)], "large.png", {
      type: "image/png",
    });
    vi.mocked(compressImage).mockRejectedValue(new Error("Compression error"));

    render(<ProfileClient />);
    const input = screen.getByLabelText("Upload profile picture");
    fireEvent.change(input, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringContaining("Could not compress"),
      );
      expect(uploadUserAvatar).toHaveBeenCalledWith(largeFile);
    });
  });

  it("falls back to username if name is missing", () => {
    vi.mocked(useProfile).mockReturnValue(
      {
        data: { ...mockProfile, first_name: "", last_name: "" },
        isLoading: false,
      } as any,
    );
    render(<ProfileClient />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("handles empty files selection", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);
    const input = screen.getByLabelText("Upload profile picture");
    fireEvent.change(input, { target: { files: [] } });
    expect(uploadUserAvatar).not.toHaveBeenCalled();
  });

  it("handles avatar click to trigger input", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);
    const input = screen.getByLabelText("Upload profile picture");
    const spy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByLabelText("Change profile picture"));
    expect(spy).toHaveBeenCalled();
  });

  it("renders phone and class information correctly", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);

    fireEvent.click(screen.getByText("EzyGo"));
    expect(screen.getByText("+911234567890")).toBeInTheDocument();
    expect(screen.getByText("Class 10")).toBeInTheDocument();
  });

  it("renders fallback join date if ezygo_created_at is missing", () => {
    vi.mocked(useProfile).mockReturnValue({
      data: {
        ...mockProfile,
        ezygo_created_at: null,
        created_at: "2022-05-20T00:00:00Z",
      },
      isLoading: false,
    } as any);
    render(<ProfileClient />);

    fireEvent.click(screen.getByText("EzyGo"));
    expect(screen.getByText(/20 May 2022/)).toBeInTheDocument();
  });

  it("handles avatar keyboard interaction", () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    render(<ProfileClient />);
    const input = screen.getByLabelText("Upload profile picture");
    const spy = vi.spyOn(input, "click");

    const avatarBtn = screen.getByLabelText("Change profile picture");
    fireEvent.keyDown(avatarBtn, { key: "Enter" });
    expect(spy).toHaveBeenCalled();

    fireEvent.keyDown(avatarBtn, { key: " " });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("renders loading overlay during upload", async () => {
    vi.mocked(useProfile).mockReturnValue(
      { data: mockProfile, isLoading: false } as any,
    );
    vi.mocked(uploadUserAvatar).mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve("url"), 100)),
    );

    render(<ProfileClient />);
    const file = new File(["content"], "test.png", { type: "image/png" });
    const input = screen.getByLabelText("Upload profile picture");
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByLabelText("Loading")).toBeInTheDocument();
  });
});
