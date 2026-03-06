import { readFileSync } from 'fs';
import path from 'path';

/**
 * Reads a PNG file from the public directory and returns it as a base64 data URI.
 * Returns null if the file cannot be read (e.g., missing in the build output).
 */
export function readPublicPngAsDataUri(fileName: string): string | null {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', fileName));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    // File unavailable — caller should handle a null return value gracefully.
    return null;
  }
}
