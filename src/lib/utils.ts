// Utility functions
// src/lib/utils.ts

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines and merges Tailwind CSS classes with proper precedence handling.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a string to Title Case (e.g. "JOHN DOE" -> "John Doe").
 */
export function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Redacts sensitive data (email, ID) for safe client-side logging using a
 * deterministic FNV-1a hash.
 */
export const redact = (type: "email" | "id", value: string): string => {
  const input = `${type}:${value}`;
  let h1 = 2166136261;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i + 1), 16777619) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
};

/**
 * Converts a number to Roman numeral representation (1-12).
 */
export const toRoman = (num: number | string): string => {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n) || n < 1) return String(num);
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return romans[n - 1] || String(n);
};

const SESSION_ROMANS = new Map<string, string>([
  ['viii', '8'], ['vii', '7'], ['vi', '6'], ['v', '5'],
  ['iv', '4'], ['iii', '3'], ['ii', '2'], ['i', '1'],
  ['ix', '9'], ['x', '10']
]);

/**
 * Normalizes session identifiers to a standard format.
 */
export const normalizeSession = (session: string | number): string => {
  if (session === null || session === undefined || String(session).toLowerCase().trim() === 'null' || String(session).trim() === '') {
    return '1';
  }
  let s = String(session).toLowerCase().trim();
  
  s = s.replace(/session|lecture|lec|lab|hour|hr|period/g, '').trim();
  s = s.replace(/(st|nd|rd|th)$/, '').trim();

  s = s.replace(/\s+/g, ' ').trim();
  if (s.includes(' ')) s = s.split(' ')[0];

  if (SESSION_ROMANS.has(s)) return SESSION_ROMANS.get(s)!;

  const num = parseInt(s, 10);
  if (!isNaN(num)) return num.toString();

  return s.toUpperCase();
};

function parseDashDate(base: string): { y: string; m: string; d: string } | null {
  const parts = base.split('-');
  if (parts.length === 3) {
    const [a, b, c] = parts.map((p) => p.trim());
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || !/^\d+$/.test(c)) {
      return null;
    }
    if (a.length === 4) {
      return { y: a, m: b.padStart(2, '0'), d: c.padStart(2, '0') };
    }
    if (c.length === 4) {
      return { y: c, m: b.padStart(2, '0'), d: a.padStart(2, '0') };
    }
  }
  return null;
}

function parseSlashDate(base: string): { y: string; m: string; d: string } | null {
  const parts = base.split('/');
  if (parts.length === 3) {
    const [rawD, rawM, rawY] = parts.map((p) => p.trim());
    if (!/^\d+$/.test(rawD) || !/^\d+$/.test(rawM) || !/^\d+$/.test(rawY)) {
      return null;
    }
    if (rawD && rawM && rawY) {
      return { y: rawY, m: rawM.padStart(2, '0'), d: rawD.padStart(2, '0') };
    }
  }
  return null;
}

/**
 * Parses a date string into { y, m, d } string parts.
 */
function parseDateParts(str: string): { y: string; m: string; d: string } | null {
  const base = str.includes('T') ? str.split('T')[0] : str;

  if (/^\d{8}$/.test(base)) {
    return { y: base.slice(0, 4), m: base.slice(4, 6), d: base.slice(6, 8) };
  }

  if (base.includes('-')) return parseDashDate(base);
  if (base.includes('/')) return parseSlashDate(base);

  return null;
}

/**
 * Normalizes a date string to ISO date format (YYYY-MM-DD).
 */
export function normalizeToISODate(str: string): string {
  if (!str) return '';
  const parts = parseDateParts(str);
  if (parts) return `${parts.y}-${parts.m}-${parts.d}`;
  return str;
}

/**
 * Standardizes date to YYYYMMDD format.
 */
export const normalizeDate = (date: string | Date): string => {
  if (!date) return "";

  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  const parts = parseDateParts(String(date).trim());
  if (parts) return `${parts.y}${parts.m}${parts.d}`;

  console.warn(`[normalizeDate] Unrecognised date format "${String(date).trim()}". Expected YYYYMMDD, YYYY-MM-DD, ISO 8601, DD-MM-YYYY, or DD/MM/YYYY. Returning "" to avoid incorrect slot keys.`);
  return "";
};

/**
 * Generates a canonical key for attendance slot identification and deduplication.
 */
export const generateSlotKey = (courseId: string | number, date: string | Date, session: string | number) => {
  const cId = String(courseId).trim();
  const d = normalizeDate(date);
  
  const normSession = normalizeSession(session);
  const n = parseInt(normSession, 10);
  const finalSession = !isNaN(n) ? toRoman(n) : normSession;

  return `${cId}_${d}_${finalSession}`;
};

const DISPLAY_ROMAN_MAP = new Map<string, string>([
  ["i", "1st Hour"],  ["ii", "2nd Hour"],  ["iii", "3rd Hour"],  ["iv", "4th Hour"],
  ["v", "5th Hour"],  ["vi", "6th Hour"],  ["vii", "7th Hour"],  ["viii", "8th Hour"],
  ["ix", "9th Hour"], ["x", "10th Hour"], ["xi", "11th Hour"], ["xii", "12th Hour"],
]);

function getOrdinalHour(num: number): string {
  if (num > 20) return `Session ${num}`;
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return `${num}st Hour`;
  if (j === 2 && k !== 12) return `${num}nd Hour`;
  if (j === 3 && k !== 13) return `${num}rd Hour`;
  return `${num}th Hour`;
}

/**
 * Formats session name for user-friendly display.
 */
export function formatSessionName(sessionName: string): string {
  if (!sessionName) return "";
  const clean = sessionName.toString().replace(/Session|Hour/gi, "").trim();
  
  const lower = clean.toLowerCase();
  if (DISPLAY_ROMAN_MAP.has(lower)) return DISPLAY_ROMAN_MAP.get(lower)!;

  const num = parseInt(clean, 10);
  if (!isNaN(num) && num > 0) {
    return getOrdinalHour(num);
  }

  return sessionName.toLowerCase().includes("session") ? sessionName : `Session ${sessionName}`;
}

const SORT_ROMAN_MAP = new Map<string, number>([
  ["i", 1], ["ii", 2],  ["iii", 3],  ["iv", 4],
  ["v", 5], ["vi", 6], ["vii", 7], ["viii", 8],
  ["ix", 9], ["x", 10], ["xi", 11], ["xii", 12],
]);

/**
 * Extracts numeric value from session name for sorting.
 */
export function getSessionNumber(name: string): number {
  if (!name) return 999;
  const clean = name.toString().toLowerCase().replace(/session|hour/g, "").trim();
  
  if (SORT_ROMAN_MAP.has(clean)) return SORT_ROMAN_MAP.get(clean)!;
  
  const match = clean.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
}

/**
 * Formats course code by removing whitespace and extracting main code.
 */
export const formatCourseCode = (code: string): string => {
  return code.toUpperCase().replace(/[\s\u00A0-]/g, "");
};

/**
 * Alias for `formatCourseCode` kept for semantic clarity.
 * Use this when normalizing course codes across the codebase.
 */
export const normalizeCourseCode = (code: string | undefined | null): string => {
  if (!code) return "";
  return formatCourseCode(String(code));
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Compresses an image file to JPEG format with quality control.
 */
export const compressImage = async (file: File, quality = 0.7): Promise<File> => {
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new RangeError(`compressImage: quality must be a finite number in [0, 1], got ${quality}`);
  }

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  const canvas = document.createElement("canvas");
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
    throw new Error("Failed to get canvas context");
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("Canvas is empty");
  }

  const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
};

const LOCALHOST_VARIANTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Gets the application domain for email addresses.
 */
export function getAppDomain(fallbackDomain: string = 'ghostclass.app'): string {
  const isProduction = process.env.NODE_ENV === "production";
  let appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  
  if (!appDomain && typeof window !== "undefined" && !isProduction) {
    const hostname = window.location.hostname;
    
    const isLocalhost = LOCALHOST_VARIANTS.has(hostname);
    const isIPv4 = IPV4_PATTERN.test(hostname);
    const isIPv6 = hostname.includes(":") || (hostname.startsWith("[") && hostname.endsWith("]"));
    
    if (hostname && !isLocalhost && !isIPv4 && !isIPv6) {
      appDomain = hostname;
    }
  }
  
  const defaultDomain = process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || fallbackDomain;
  
  if (isProduction && !process.env.NEXT_PUBLIC_APP_DOMAIN && !process.env.NEXT_PUBLIC_DEFAULT_DOMAIN) {
    console.warn(
      '[SECURITY] getAppDomain: NEXT_PUBLIC_APP_DOMAIN and NEXT_PUBLIC_DEFAULT_DOMAIN are not set in production. ' +
      `Using hardcoded fallback domain '${defaultDomain}'. This could be a security risk for error reporting. ` +
      'Please configure these environment variables.'
    );
  }
  
  return appDomain || defaultDomain;
}

/**
 * Type-guard that narrows a raw avatar_url from the DB to a known-safe string.
 */
export function isValidAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
/**
 * Strips all trailing slashes from a string without using regex backtracking.
 */
export function stripTrailingSlashes(str: string | undefined): string {
  if (!str) return "";
  let s = str.trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}
