/** Centralized theme constants for all map components */

// ── Text ──
export const TEXT_HEADING = "#0f172a";
export const TEXT_PRIMARY = "#1e293b";
export const TEXT_SECONDARY = "#334155";
export const TEXT_MUTED = "#64748b";
export const TEXT_FAINT = "#94a3b8";

// ── Surfaces ──
export const PANEL_BG = "#ffffff";
export const PANEL_BG_LIGHT = "#ffffff";
export const INPUT_BG = "rgba(241, 245, 249, 0.8)";
export const HOVER_BG = "rgba(148, 163, 184, 0.12)";
export const ACTIVE_BG = "rgba(148, 163, 184, 0.15)";
export const BUTTON_BG = "rgba(30, 41, 59, 0.5)";

// ── Primary ──
// Matches the neutral shadcn primary. Accent aliases remain for internal
// compatibility while every interactive state resolves to this one token.
export const PRIMARY = "#18181b";
export const PRIMARY_60 = "rgba(24, 24, 27, 0.6)";
export const PRIMARY_30 = "rgba(24, 24, 27, 0.3)";
export const PRIMARY_15 = "rgba(24, 24, 27, 0.15)";
export const PRIMARY_10 = "rgba(24, 24, 27, 0.1)";
export const ACCENT = PRIMARY;
export const ACCENT_60 = PRIMARY_60;
export const ACCENT_30 = PRIMARY_30;
export const ACCENT_15 = PRIMARY_15;
export const ACCENT_10 = PRIMARY_10;

// ── Danger ──
export const DANGER = "#ef4444";
export const DANGER_BG = "rgba(239, 68, 68, 0.15)";

// ── Borders ──
export const BORDER = "1px solid rgba(148, 163, 184, 0.25)";
export const BORDER_SUBTLE = "1px solid rgba(148, 163, 184, 0.15)";
export const BORDER_INPUT = "1px solid rgba(148, 163, 184, 0.3)";

// ── Shadows ──
export const SHADOW_SM = "0 4px 24px rgba(0, 0, 0, 0.08)";
export const SHADOW_MD = "0 8px 32px rgba(0, 0, 0, 0.1)";

// ── Typography ──
export const FONT_FAMILY = "'Inter', system-ui, sans-serif";

// ── Backdrop ──
export const BLUR_SM = "blur(8px)";
export const BLUR_MD = "blur(12px)";
export const BLUR_LG = "blur(16px)";

// ── Data Colors (re-exported from shared constants to avoid circular imports) ──
export { STATUS_COLORS, TYPE_COLORS, WELL_TYPE_COLORS } from "../constants/colors";
