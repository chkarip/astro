/**
 * @file Shared status configuration used by IndexCard and Task node components.
 *
 * Keeping these constants in one place ensures that:
 *  - Visual tokens (colors, labels) stay consistent across nodes and the MiniMap.
 *  - Adding a new status value only requires editing this file.
 *  - Both cycle arrays are guaranteed to stay in sync with their config maps.
 */

import type { NodeStatus, TaskStatus } from "../types";

// ─── IndexCard node statuses ──────────────────────────────────────────────────

/** Visual tokens for each IndexCard status value. */
export const INDEX_CARD_STATUS_CONFIG: Record<
  NodeStatus,
  { color: string; label: string; bgTint: string | null }
> = {
  pending:     { color: "#4A5568", label: "Pending",     bgTint: null },
  in_progress: { color: "#ECC94B", label: "In Progress", bgTint: "rgba(236,201,75,0.06)" },
  done:        { color: "#48BB78", label: "Done",        bgTint: null },
  blocked:     { color: "#FC8181", label: "Blocked",     bgTint: null },
};

/**
 * Click-to-cycle order for IndexCard status.
 * Must contain every key of `INDEX_CARD_STATUS_CONFIG`.
 */
export const INDEX_CARD_STATUS_CYCLE: NodeStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
];

// ─── Task node statuses ───────────────────────────────────────────────────────

/** Visual tokens for each Task status value. */
export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { border: string; dot: string; label: string }
> = {
  pending:    { border: "#6B7280", dot: "#6B7280", label: "Pending" },
  inprogress: { border: "#F59E0B", dot: "#F59E0B", label: "In Progress" },
  done:       { border: "#22C55E", dot: "#22C55E", label: "Done" },
  blocked:    { border: "#EF4444", dot: "#EF4444", label: "Blocked" },
};

/**
 * Click-to-cycle order for Task status.
 * Must contain every key of `TASK_STATUS_CONFIG`.
 */
export const TASK_STATUS_CYCLE: TaskStatus[] = [
  "pending",
  "inprogress",
  "done",
  "blocked",
];

// ─── MiniMap color helper ─────────────────────────────────────────────────────

/**
 * Returns the MiniMap dot color for a task node given its raw status string.
 * Falls back to a muted blue for unknown / undefined statuses.
 */
export function taskMiniMapColor(status: string | undefined): string {
  switch (status as TaskStatus) {
    case "done":       return "#22C55E";
    case "blocked":    return "#EF4444";
    case "inprogress": return "#F59E0B";
    default:           return "#3a5070";
  }
}
