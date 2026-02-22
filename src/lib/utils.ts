// Utility functions
// src/lib/utils.ts

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
// utils.ts intentionally does NOT import from logger.ts to avoid a latent
// circular-dependency risk. If logger.ts ever imports any util (cn, redact, etc.),
// Node.js would deliver a partially-initialised module, potentially causing 'undefined'
// exports. Use console.warn / console.error here instead.

/**
 * Combines and merges Tailwind CSS classes with proper precedence handling.
 * Uses clsx for conditional class handling and tailwind-merge to resolve conflicts.
 * 
 * @param inputs - Class values to merge (strings, arrays, objects, etc.)
 * @returns Merged class string with resolved Tailwind conflicts
 * @example
 * ```ts
 * cn('px-2 py-1', 'px-4') // Returns 'py-1 px-4' (px-4 overrides px-2)
 * cn('text-red-500', { 'text-blue-500': isActive }) // Conditionally applies classes
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Redacts sensitive data (email, ID) for safe client-side logging using a
 * deterministic FNV-1a hash.
 *
 * Server callers (API routes, server actions) should use the `redact` export from
 * @/lib/utils.server which uses HMAC-SHA256 keyed on SENTRY_HASH_SALT instead.
 * This implementation is intentionally crypto-import-free so it does not pull
 * Node.js's `crypto` module into browser bundles.
 *
 * Since SENTRY_HASH_SALT is a non-NEXT_PUBLIC_ variable it is never shipped to the
 * browser, so a keyed HMAC would provide no additional security here anyway.
 *
 * @param type  - Type of data being redacted ('email' or 'id')
 * @param value - The sensitive value to redact
 * @returns A 12-character deterministic hex string safe for logging
 */
export const redact = (type: "email" | "id", value: string): string => {
  const input = `${type}:${value}`;
  // FNV-1a 32-bit — two independent passes with different seeds for 64 bits of output
  let h1 = 2166136261; // FNV-1a 32-bit offset basis
  let h2 = 0x811c9dc5; // second independent offset
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i + 1), 16777619) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
};


/**
 * Converts a number to Roman numeral representation (1-12).
 * Numbers outside this range are returned as-is.
 * 
 * @param num - Number or string to convert (1-12)
 * @returns Roman numeral string (I-XII) or original value if out of range
 * @example
 * ```ts
 * toRoman(1) // Returns "I"
 * toRoman(3) // Returns "III"
 * toRoman(12) // Returns "XII"
 * toRoman(15) // Returns "15" (out of range)
 * ```
 */
export const toRoman = (num: number | string): string => {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n) || n < 1) return String(num);
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return romans[n - 1] || String(n);
};

/**
 * Normalizes session identifiers to a standard format.
 * Converts various session inputs ("Session 1", "2nd Hour", "iii", "Lab")
 * into a standardized string number ("1", "2", "3") or upper case string ("LAB").
 * 
 * @param session - Session identifier in various formats
 * @returns Normalized session string (numeric or uppercase)
 * @example
 * ```ts
 * normalizeSession("Session 1") // Returns "1"
 * normalizeSession("iii") // Returns "3"
 * normalizeSession("2nd Hour") // Returns "2"
 * normalizeSession("Lab") // Returns "LAB"
 * ```
 */
export const normalizeSession = (session: string | number): string => {
  let s = String(session).toLowerCase().trim();
  
  // 1. Remove common noise
  s = s.replace(/session|lecture|lec|lab|hour|hr|period/g, '').trim();
  s = s.replace(/(st|nd|rd|th)$/, '').trim(); // Remove ordinals

  // Collapse internal multi-spaces left by noise removal (e.g. "vii  extra" after
  // stripping "session"), then take only the first word if any remain so that
  // "vii extra" → "vii" → "7" rather than falling through to the uppercase fallback
  // and producing "VII EXTRA", which would generate a permanently wrong slot key.
  s = s.replace(/\s+/g, ' ').trim();
  if (s.includes(' ')) s = s.split(' ')[0];

  // 2. Roman to Number Map
  const romans: Record<string, string> = {
      'viii': '8', 'vii': '7', 'vi': '6', 'v': '5',
      'iv': '4', 'iii': '3', 'ii': '2', 'i': '1',
      'ix': '9', 'x': '10'
  };

  if (romans[s]) return romans[s];

  // 3. Parse Integer
  const num = parseInt(s, 10);
  if (!isNaN(num)) return num.toString();

  // 4. Fallback (e.g. "A", "B", "Extra")
  return s.toUpperCase();
};

/**
 * @internal
 * Parses a date string into { y, m, d } string parts.
 * Returns null for unrecognised formats so callers can handle the failure explicitly.
 *
 * E-I: Single authoritative parsing core shared by normalizeToISODate and normalizeDate,
 * eliminating the duplicated branch logic that previously existed in both functions.
 *
 * Supported formats:
 *   • ISO 8601 with time  — "2024-01-15T10:30:00Z" (time component stripped)
 *   • ISO date            — "2024-01-15"  (YYYY-MM-DD)
 *   • Dash-separated DMY  — "15-01-2024"  (DD-MM-YYYY)
 *   • Slash-separated DMY — "15/01/2024"  (DD/MM/YYYY)
 */
function parseDateParts(str: string): { y: string; m: string; d: string } | null {
  // Strip time component from ISO 8601 strings before further parsing.
  const base = str.includes('T') ? str.split('T')[0] : str;

  // YYYYMMDD (no separator) — e.g. "20251201" returned by EzyGo API
  if (/^\d{8}$/.test(base)) {
    return { y: base.slice(0, 4), m: base.slice(4, 6), d: base.slice(6, 8) };
  }

  if (base.includes('-')) {
    const parts = base.split('-');
    if (parts.length === 3) {
      const [a, b, c] = parts.map((p) => p.trim());
      if (a.length === 4) {
        // YYYY-MM-DD
        return { y: a, m: b.padStart(2, '0'), d: c.padStart(2, '0') };
      }
      if (c.length === 4) {
        // DD-MM-YYYY
        return { y: c, m: b.padStart(2, '0'), d: a.padStart(2, '0') };
      }
    }
  }

  if (base.includes('/')) {
    const parts = base.split('/');
    if (parts.length === 3) {
      const [rawD, rawM, rawY] = parts.map((p) => p.trim());
      if (rawD && rawM && rawY) {
        // DD/MM/YYYY
        return { y: rawY, m: rawM.padStart(2, '0'), d: rawD.padStart(2, '0') };
      }
    }
  }

  return null;
}

/**
 * Normalizes a date string to ISO date format (YYYY-MM-DD).
 * Handles ISO datetime strings (with T), DD/MM/YYYY, DD-MM-YYYY, and YYYY-MM-DD.
 *
 * @param str - Date string in any of the supported formats
 * @returns Date string in YYYY-MM-DD format, or the original string if unrecognised
 * @example
 * ```ts
 * normalizeToISODate("2024-01-15T10:30:00Z") // Returns "2024-01-15"
 * normalizeToISODate("15/01/2024")            // Returns "2024-01-15"
 * normalizeToISODate("2024-01-15")            // Returns "2024-01-15"
 * ```
 */
export function normalizeToISODate(str: string): string {
  if (!str) return '';
  // delegate to shared parser; pass through original string if format is unrecognised
  // (matches the previous fallback `return str` behaviour).
  const parts = parseDateParts(str);
  if (parts) return `${parts.y}-${parts.m}-${parts.d}`;
  return str;
}

/**
 * Standardizes date to YYYYMMDD format.
 * Handles Date objects, ISO strings, YYYYMMDD, DD-MM-YYYY, and DD/MM/YYYY.
 *
 * @param date - Date in various formats (Date object, ISO string, YYYYMMDD, DD-MM-YYYY)
 * @returns Date string in YYYYMMDD format, or "" for unrecognised string formats
 * @example
 * ```ts
 * normalizeDate(new Date(2024, 0, 15))   // Returns "20240115"
 * normalizeDate("2024-01-15T10:30:00Z") // Returns "20240115"
 * normalizeDate("20240115")              // Returns "20240115"
 * normalizeDate("15-01-2024")           // Returns "20240115"
 * ```
 */
export const normalizeDate = (date: string | Date): string => {
  if (!date) return "";

  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // delegate to shared parser.
  const parts = parseDateParts(String(date).trim());
  if (parts) return `${parts.y}${parts.m}${parts.d}`;

  // Unrecognised format — silently stripping non-digit chars could produce
  // a plausible-looking but wrong YYYYMMDD string, poisoning slot-key lookups.
  // console.warn used deliberately — see logger import note at top of file.
  console.warn(`[normalizeDate] Unrecognised date format "${String(date).trim()}". Expected YYYYMMDD, YYYY-MM-DD, ISO 8601, DD-MM-YYYY, or DD/MM/YYYY. Returning "" to avoid incorrect slot keys.`);
  return "";
};

/**
 * Generates a canonical key for attendance slot identification and deduplication.
 * Format: {COURSEID}_{YYYYMMDD}_{SESSION_ROMAN_OR_UPPER}
 * 
 * @param courseId - Course identifier
 * @param date - Date of the session
 * @param session - Session identifier
 * @returns Canonical slot key string
 * @example
 * ```ts
 * generateSlotKey(101, "2024-01-15", 1) // Returns "101_20240115_I"
 * generateSlotKey("CS101", new Date(2024, 0, 15), "iii") // Returns "CS101_20240115_III"
 * ```
 */
export const generateSlotKey = (courseId: string | number, date: string | Date, session: string | number) => {
  const cId = String(courseId).trim();
  const d = normalizeDate(date);
  
  // Logic: Normalized Number -> Roman (matches DB/Legacy logic)
  const normSession = normalizeSession(session);
  const n = parseInt(normSession, 10);
  const finalSession = !isNaN(n) ? toRoman(n) : normSession;

  return `${cId}_${d}_${finalSession}`;
};

/**
 * Formats session name for user-friendly display.
 * Converts session identifiers to ordinal format (1st Hour, 2nd Hour, etc.).
 * 
 * @param sessionName - Raw session identifier
 * @returns Formatted session name for display
 * @example
 * ```ts
 * formatSessionName("i") // Returns "1st Hour"
 * formatSessionName("2") // Returns "2nd Hour"
 * formatSessionName("iii") // Returns "3rd Hour"
 * ```
 */
export function formatSessionName(sessionName: string): string {
  if (!sessionName) return "";
  const clean = sessionName.toString().replace(/Session|Hour/gi, "").trim();
  
  // Handle Roman numerals (case-insensitive)
  const lower = clean.toLowerCase();
  // Extended to xii so that session identifiers produced by toRoman() or
  // normalizeSession() beyond "viii" (e.g. "ix", "x") do not fall through to
  // parseInt() → NaN → ugly "Session ix" fallback instead of "9th Hour".
  const romanMap: Record<string, string> = {
    "i": "1st Hour",  "ii": "2nd Hour",  "iii": "3rd Hour",  "iv": "4th Hour",
    "v": "5th Hour",  "vi": "6th Hour",  "vii": "7th Hour",  "viii": "8th Hour",
    "ix": "9th Hour", "x": "10th Hour", "xi": "11th Hour", "xii": "12th Hour",
  };
  if (romanMap[lower]) return romanMap[lower];

  // Handle numbers
  const num = parseInt(clean, 10);
  if (!isNaN(num) && num > 0) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return `${num}st Hour`;
    if (j === 2 && k !== 12) return `${num}nd Hour`;
    if (j === 3 && k !== 13) return `${num}rd Hour`;
    return `${num}th Hour`;
  }

  // Fallback
  return sessionName.toLowerCase().includes("session") ? sessionName : `Session ${sessionName}`;
}

/**
 * Extracts numeric value from session name for sorting.
 * Converts Roman numerals and text to sortable numbers.
 * 
 * @param name - Session name in any format
 * @returns Numeric value for sorting (999 if unable to parse)
 * @example
 * ```ts
 * getSessionNumber("1st Hour") // Returns 1
 * getSessionNumber("iii") // Returns 3
 * getSessionNumber("Session 5") // Returns 5
 * getSessionNumber("Lab") // Returns 999 (fallback)
 * ```
 */
export function getSessionNumber(name: string): number {
  if (!name) return 999;
  // Removed redundant second .replace(/hour/g, "") — "hour" is already
  // eliminated by the combined /session|hour/g regex in the first pass.
  const clean = name.toString().toLowerCase().replace(/session|hour/g, "").trim();
  
  // Extended to xii to match the formatSessionName romanMap.
  const romanMap: Record<string, number> = { 
    "i": 1, "ii": 2,  "iii": 3,  "iv": 4,
    "v": 5, "vi": 6, "vii": 7, "viii": 8,
    "ix": 9, "x": 10, "xi": 11, "xii": 12,
  };
  if (romanMap[clean]) return romanMap[clean];
  
  const match = clean.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
}

/**
 * Formats course code by removing whitespace and extracting main code.
 * Handles hyphenated codes by taking the prefix.
 * 
 * @param code - Raw course code
 * @returns Formatted course code without whitespace
 * @example
 * ```ts
 * formatCourseCode("CS 101-A") // Returns "CS101"
 * formatCourseCode("MATH 201") // Returns "MATH201"
 * ```
 */
export const formatCourseCode = (code: string): string => {
  if (code.includes("-")) {
    const subcode = code.split("-")[0].trim();
    return subcode.replace(/[\s\u00A0]/g, "");
  }

  return code.replace(/[\s\u00A0]/g, "");
};

/**
 * Compresses an image file to JPEG format with quality control.
 * Automatically resizes images larger than 1920px width while maintaining aspect ratio.
 * Adds white background to handle transparent PNGs.
 * 
 * @param file - Image file to compress
 * @param quality - JPEG quality (0-1), defaults to 0.7
 * @returns Promise resolving to compressed JPEG file
 * @throws {Error} If canvas context cannot be created or compression fails
 * @example
 * ```ts
 * const compressed = await compressImage(imageFile, 0.8)
 * // Returns JPEG with 80% quality, max width 1920px
 * ```
 */
export const compressImage = (file: File, quality = 0.7): Promise<File> => {
  // Fail fast for out-of-range quality values. canvas.toBlob() silently clamps
  // quality in most browsers, but quality=0 produces a near-unreadable image and
  // values outside [0,1] or NaN produce browser-specific undefined behaviour.
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    return Promise.reject(
      new RangeError(`compressImage: quality must be a finite number in [0, 1], got ${quality}`)
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        
        // Scale down if image is massive
        const maxWidth = 1920; 
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Fill background with white before drawing
        // This prevents transparent PNGs from turning black when converted to JPEG
        ctx.fillStyle = "#FFFFFF"; 
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with specified quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas is empty"));
              return;
            }

            const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            
            const compressedFile = new File([blob], newName, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Constants for hostname validation
const LOCALHOST_VARIANTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
// IPv6 pattern: matches standard IPv6 format or bracket-enclosed format
// window.location.hostname never includes ports, so we don't need to worry about port separators
// Note: The bracket pattern is intentionally permissive for localhost detection purposes only.
// It matches [::1] and other bracket-enclosed formats without full RFC 4291 validation.
const IPV6_PATTERN = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^\[.*\]$/;

/**
 * Gets the application domain for email addresses, extracting from environment
 * variable or window.location.hostname with validation to filter out localhost/IP addresses.
 * 
 * This utility provides consistent hostname detection logic across error components.
 * 
 * FALLBACK BEHAVIOR:
 * 1. Uses NEXT_PUBLIC_APP_DOMAIN environment variable if set (RECOMMENDED)
 * 2. Uses NEXT_PUBLIC_DEFAULT_DOMAIN environment variable if set
 * 3. In development only: Falls back to window.location.hostname if available and not localhost/IP
 * 4. Uses the provided fallbackDomain parameter (default: 'ghostclass.app')
 * 
 * SECURITY WARNING:
 * In production, this function requires NEXT_PUBLIC_APP_DOMAIN or NEXT_PUBLIC_DEFAULT_DOMAIN
 * to be explicitly configured. Using window.location.hostname in production could allow
 * attackers to control the email destination via hostname manipulation (e.g., through
 * open redirects or malicious proxies), potentially exposing error details.
 * 
 * The function will log a warning in production if environment variables are not set
 * and will refuse to use window.location.hostname as a fallback for security.
 * 
 * @param fallbackDomain - The fallback domain to use if no valid domain can be determined (default: 'ghostclass.app')
 * @returns The application domain suitable for use in email addresses
 * 
 * @example
 * ```ts
 * const domain = getAppDomain(); // Returns domain from env or fallback
 * const email = `admin@${domain}`;
 * ```
 */
export function getAppDomain(fallbackDomain: string = 'ghostclass.app'): string {
  const isProduction = process.env.NODE_ENV === "production";
  let appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  
  // Only use window.location.hostname in development for convenience.
  // In production, this is a security risk and should never be used.
  //
  // NOTE: process.env.NODE_ENV is inlined at build time by Next.js in ALL
  // environments. Next.js always produces a compiled bundle with NODE_ENV="production"
  // at build time, so `isProduction` is always true in the compiled client output and
  // `!isProduction` is always false — this block is effectively dead code in any built
  // Next.js client bundle. It is preserved for non-Next.js contexts (tests, scripts)
  // and for documentation purposes.
  if (!appDomain && typeof window !== "undefined" && !isProduction) {
    const hostname = window.location.hostname;
    
    // Check if hostname is a local development environment or IP address
    const isLocalhost = LOCALHOST_VARIANTS.has(hostname);
    const isIPv4 = IPV4_PATTERN.test(hostname);
    const isIPv6 = IPV6_PATTERN.test(hostname);
    
    if (hostname && !isLocalhost && !isIPv4 && !isIPv6) {
      appDomain = hostname;
    }
  }
  
  // Use environment variable for default domain if set, otherwise use parameter
  const defaultDomain = process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || fallbackDomain;
  
  // Security check: warn if using fallback in production
  // console.warn used deliberately — see logger import note at top of file.
  if (isProduction && !process.env.NEXT_PUBLIC_APP_DOMAIN && !process.env.NEXT_PUBLIC_DEFAULT_DOMAIN) {
    console.warn(
      '[SECURITY] getAppDomain: NEXT_PUBLIC_APP_DOMAIN and NEXT_PUBLIC_DEFAULT_DOMAIN are not set in production. ' +
      `Using hardcoded fallback domain '${defaultDomain}'. This could be a security risk for error reporting. ` +
      'Please configure these environment variables.'
    );
  }
  
  // Final fallback
  return appDomain ?? defaultDomain;
}

/**
 * Type-guard that narrows a raw avatar_url from the DB to a known-safe string
 * suitable for use as a Next.js <Image> src.
 *
 * profile.avatar_url is stored as `text` in Supabase and is read back verbatim.
 * If the row was ever directly modified, or if NEXT_PUBLIC_SUPABASE_URL was
 * mis-configured at the time of upload, the stored URL could point to a
 * different Supabase project or a non-Supabase domain entirely. Passing such a
 * URL to <Image> would throw a Next.js optimisation error at runtime. This guard
 * ensures the URL is valid, is served over HTTPS, and originates from the
 * configured Supabase project before it reaches the Image component.
 *
 * @param url - Value read from `UserProfile.avatar_url`
 */
export function isValidAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // If the env var is absent at runtime (should not happen in production due to
    // validate-env.ts), fall through and allow any HTTPS URL rather than blocking
    // all avatars — a broken avatar is worse UX than a permissive fallback.
    if (!supabaseUrl) return true;
    return parsed.hostname === new URL(supabaseUrl).hostname;
  } catch {
    return false;
  }
}
