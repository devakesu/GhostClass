/**
 * Shared theme localStorage key.
 *
 * Intentionally kept in a plain (non-client) module so it can be safely
 * imported from both Client Components (theme.tsx) and Server Components
 * (layout.tsx pre-hydration script) without pulling in any client-only code.
 */
export const THEME_STORAGE_KEY = "ghostclass-theme";
