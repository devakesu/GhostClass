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
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
