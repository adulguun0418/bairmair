/**
 * Which browser errors are worth reporting (PostHog error tracking, `src/lib/analytics.ts`).
 * Pure, so it can be tested without a browser.
 *
 * Dropped:
 * - errors thrown by browser extensions (password managers, translators, ad blockers) that run
 *   inside our pages: any stack frame from an extension URL;
 * - "Script error.": a cross-origin script failed and the browser hides everything else;
 * - ResizeObserver loop warnings, which browsers report as errors but are harmless.
 */

/** One exception as PostHog's `$exception_list` describes it (only the parts we read). */
export interface ReportedException {
  type?: string;
  value?: string;
  stacktrace?: { frames?: { filename?: string; abs_path?: string }[] | null } | null;
}

const EXTENSION_URL = /^(chrome|moz|safari|safari-web|ms-browser|edge)-extension:\/\//;

const NOISE = [/^Script error\.?$/, /^ResizeObserver loop/];

export function isReportableException(list: readonly ReportedException[] | undefined): boolean {
  if (!list || list.length === 0) return true;
  for (const exception of list) {
    const message = exception.value?.trim() ?? '';
    if (NOISE.some((pattern) => pattern.test(message))) return false;
    for (const frame of exception.stacktrace?.frames ?? []) {
      const file = frame.filename ?? frame.abs_path ?? '';
      if (EXTENSION_URL.test(file)) return false;
    }
  }
  return true;
}
