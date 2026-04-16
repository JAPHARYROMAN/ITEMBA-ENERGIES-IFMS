/* ------------------------------------------------------------------ */
/*  Application-wide magic numbers & configuration defaults            */
/* ------------------------------------------------------------------ */

// ── DataTable / Pagination ──────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

// ── Dashboard ───────────────────────────────────────────────────────
export const DASHBOARD_CHART_MONTHS = 7;

// ── POS ─────────────────────────────────────────────────────────────
export const MAX_DISCOUNT = 50;
export const QUICK_PAYMENT_PRESETS = [20, 50, 100] as const;

// ── Shift draft persistence ─────────────────────────────────────────
export const CLOSE_SHIFT_DRAFT_KEY = 'ifms-close-shift-draft';
export const OPEN_SHIFT_DRAFT_KEY = 'ifms-open-shift-draft';

// ── Export polling ──────────────────────────────────────────────────
export const EXPORT_POLL_INTERVAL_MS = 1800;
export const EXPORT_INITIAL_DELAY_MS = 1000;

// ── FilterBar date presets ──────────────────────────────────────────
export const DATE_PRESETS = [7, 30, 90] as const;
