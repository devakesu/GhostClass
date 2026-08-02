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
  const win = window as unknown as {
    matchMedia?: (query: string) => { matches: boolean };
    navigator?: { standalone?: boolean };
  };
  return (
    (typeof win.matchMedia === "function" &&
      win.matchMedia("(display-mode: standalone)").matches) ||
    win.navigator?.standalone === true
  );
}
