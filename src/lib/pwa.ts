/**
 * Returns true when the app is running as an installed standalone PWA.
 *
 * Detection strategy:
 *   - Chrome / Edge / Android: `display-mode: standalone` media query.
 *   - iOS Safari: `navigator.standalone === true`.
 *
 * Always returns false in SSR / non-browser environments.
 */
export function isStandalonePWA(): boolean {
  if (typeof globalThis.window === "undefined") return false;
  return (
    (typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(display-mode: standalone)").matches) ||
    (globalThis.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
