import "server-only";
import { readFileSync } from "fs";
import path from "path";

// Only allow simple PNG filenames (no path separators or directory traversal).
const SAFE_PUBLIC_PNG_NAME = /^[A-Za-z0-9._-]+\.png$/;

/**
 * Reads a PNG file from the public directory and returns it as a base64 data URI.
 * Returns null if the file cannot be read (e.g., missing in the build output) or
 * if the filename is unsafe (prevents path traversal outside /public).
 */
export function readPublicPngAsDataUri(fileName: string): string | null {
  if (!SAFE_PUBLIC_PNG_NAME.test(fileName)) {
    // Reject unsafe or non-PNG filenames to prevent path traversal outside /public.
    return null;
  }
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Filename is strictly validated against path traversal regex above
    const buf = readFileSync(path.join(process.cwd(), "public", fileName));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // File unavailable — caller should handle a null return value gracefully.
    return null;
  }
}
