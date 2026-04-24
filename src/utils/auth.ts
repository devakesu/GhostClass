// Auth token management utilities
// src/utils/auth.ts

const encodeCookieValue = (value: string) => encodeURIComponent(value);

const decodeCookieValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const setBrowserCookie = (
  name: string,
  value: string,
  options: { expires?: Date; sameSite?: "lax" | "strict" | "none"; path?: string },
) => {
  if (typeof document === "undefined") return;

  const parts = [`${name}=${encodeCookieValue(value)}`];
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  document.cookie = parts.join("; ");
};

const getBrowserCookie = (name: string): string | undefined => {
  if (typeof document === "undefined") return undefined;

  const prefix = `${name}=`;
  const match = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix));

  if (!match) return undefined;
  return decodeCookieValue(match.slice(prefix.length));
};

const deleteBrowserCookie = (name: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export const setToken = (token: string, expiresInDays: number = 31) => {
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  
  setBrowserCookie("ezygo_access_token", token, {
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
};

export const getToken = () => {
  return getBrowserCookie("ezygo_access_token");
};

export const removeToken = () => {
  deleteBrowserCookie("ezygo_access_token");
};
