/** Shared color constants for asset status, type, and well type.
 *  Consumed by both utils and component theme. */

// ── Asset Status Colors ──
export const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  producing: "#22c55e",
  "shut-in": "#f59e0b",
  inactive: "#f59e0b",
  drilled: "#6366f1",
  permitted: "#8b5cf6",
  abandoned: "#6b7280",
  offline: "#6b7280",
  injection: "#06b6d4",
  maintenance: "#f97316",
};

// ── Asset Type Colors ──
export const TYPE_COLORS: Record<string, string> = {
  well: "#22c55e",
  meter: "#06b6d4",
  pipeline: "#f59e0b",
  facility: "#8b5cf6",
  tank: "#ef4444",
  compressor: "#ec4899",
  valve: "#14b8a6",
  pump: "#f97316",
  separator: "#a855f7",
  "injection-point": "#06b6d4",
};

// ── Well Type Colors ──
export const WELL_TYPE_COLORS: Record<string, string> = {
  oil: "#22c55e",
  gas: "#ef4444",
  injection: "#06b6d4",
  disposal: "#8b5cf6",
  observation: "#6b7280",
};
