export function isCookieSecure(): boolean {
  // Use NODE_ENV=production as the authoritative indicator of production
  // deployment; fall back to HTTPS env var for legacy environments.
  return process.env.NODE_ENV === "production" || process.env.HTTPS === "true";
}
