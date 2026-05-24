import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ContextMenuState, TaskStatus } from "../types";

// ─── Shared menu item style helpers ──────────────────────────────────────────

function MenuItem({
  label, icon, onClick, danger = false, disabled = false,
}: {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 10px",
        background: "transparent",
        border: "none",
        color: disabled ? "#3a5070" : danger ? "#EF4444" : "#ccd6f6",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        cursor: disabled ? "default" : "pointer",
        borderRadius: 4,
        textAlign: "left",
        transition: "background 0.1s",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger
            ? "rgba(239,68,68,0.12)"
            : "rgba(74,158,255,0.10)";
        }
      }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon && <span style={{ fontSize: 12, lineHeight: 1, width: 14, textAlign: "center" }}>{icon}</span>}
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "#1e3a5f",
        margin: "3px 8px",
      }}
    />
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "4px 10px 2px",
        fontSize: 9,
        color: "#3a5070",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}

// ─── Status items ─────────────────────────────────────────────────────────────

const STATUS_ITEMS: Array<{ status: TaskStatus; label: string; color: string; icon: string }> = [
  { status: "pending",    label: "Pending",     color: "#6B7280", icon: "○" },
  { status: "inprogress", label: "In Progress", color: "#F59E0B", icon: "◐" },
  { status: "done",       label: "Done",        color: "#22C55E", icon: "●" },
  { status: "blocked",    label: "Blocked",     color: "#EF4444", icon: "⊘" },
];

const EDGE_LABELS = ["Requires", "Informs", "Blocks", "References", ""];

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  // Node actions
  onSetNodeStatus?: (nodeId: string, status: TaskStatus) => void;
  onAddChildTask?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  // Edge actions
  onSetEdgeLabel?: (edgeId: string, label: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
}

export function ContextMenu({
  state, onClose,
  onSetNodeStatus, onAddChildTask, onDeleteNode,
  onSetEdgeLabel, onDeleteEdge,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp position so menu stays on screen
  const MENU_W = 180;
  const MENU_H = 260;
  const x = state ? Math.min(state.x, window.innerWidth - MENU_W - 8) : 0;
  const y = state ? Math.min(state.y, window.innerHeight - MENU_H - 8) : 0;

  // Close on outside click or Escape
  useEffect(() => {
    if (!state) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [state, onClose]);

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          ref={menuRef}
          key="context-menu"
          initial={{ opacity: 0, scale: 0.94, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -4 }}
          transition={{ duration: 0.1 }}
          style={{
            position: "fixed",
            left: x,
            top: y,
            zIndex: 99999,
            background: "#0a1628",
            border: "1px solid #1e3a5f",
            borderRadius: 7,
            padding: "5px 0",
            minWidth: MENU_W,
            boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(74,158,255,0.08)",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {state.type === "node" && (
            <>
              <SectionLabel label="Set Status" />
              {STATUS_ITEMS.map(({ status, label, color, icon }) => (
                <button
                  key={status}
                  onClick={() => { onSetNodeStatus?.(state.nodeId, status); onClose(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "5px 10px",
                    background: "transparent",
                    border: "none",
                    color: "#ccd6f6",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    cursor: "pointer",
                    borderRadius: 4,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${color}18`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color, fontSize: 12, width: 14, textAlign: "center" }}>{icon}</span>
                  {label}
                </button>
              ))}
              <Divider />
              <MenuItem
                icon="⊕"
                label="Add Child Task"
                onClick={() => { onAddChildTask?.(state.nodeId); onClose(); }}
              />
              <Divider />
              <MenuItem
                icon="⊗"
                label="Delete Task"
                danger
                onClick={() => { onDeleteNode?.(state.nodeId); onClose(); }}
              />
            </>
          )}

          {state.type === "edge" && (
            <>
              <SectionLabel label="Connection Label" />
              {EDGE_LABELS.map((lbl) => (
                <button
                  key={lbl || "_none"}
                  onClick={() => { onSetEdgeLabel?.(state.edgeId, lbl); onClose(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "5px 10px",
                    background: state.currentLabel === lbl ? "rgba(74,158,255,0.12)" : "transparent",
                    border: "none",
                    color: state.currentLabel === lbl ? "#4A9EFF" : "#ccd6f6",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    cursor: "pointer",
                    borderRadius: 4,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (state.currentLabel !== lbl) e.currentTarget.style.background = "rgba(74,158,255,0.08)"; }}
                  onMouseLeave={(e) => { if (state.currentLabel !== lbl) e.currentTarget.style.background = "transparent"; }}
                >
                  {lbl || <span style={{ color: "#3a5070", fontStyle: "italic" }}>None</span>}
                </button>
              ))}
              <Divider />
              <MenuItem
                icon="⊗"
                label="Delete Connection"
                danger
                onClick={() => { onDeleteEdge?.(state.edgeId); onClose(); }}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
