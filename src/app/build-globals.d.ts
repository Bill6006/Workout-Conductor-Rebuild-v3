/**
 * Build-time constants injected by Vite `define` (see vite.config.ts).
 *
 * These are compile-time text replacements, not runtime lookups, so a
 * non-Vite environment (jsdom under Vitest) may not have them at all.
 * Read them through src/app/buildInfo.ts, which guards for that.
 */
declare const __BUILD_MARKER__: string
declare const __BUILD_PHASE__: string
declare const __BUILD_COMMIT__: string
declare const __BUILD_TIME__: string
