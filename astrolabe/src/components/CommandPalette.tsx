import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SpawnableNodeType } from "./NodeToolbar";
import { isBlockType } from "./NodeToolbar";

interface PaletteItem {
  type: SpawnableNodeType;
  icon: string;
  label: string;
  description: string;
  color: string;
  monoIcon?: boolean;
}

const ITEMS: PaletteItem[] = [
  {
    type: "index_card",
    icon: "🗂",
    label: "Index Card",
    description: "Task card with checkbox and status",
    color: "#7aa2f7",
  },
  {
    type: "note",
    icon: "✦",
    label: "Note",
    description: "Borderless pill — plain text annotation",
    color: "#64ffda",
  },
  {
    type: "milestone",
    icon: "◆",
    label: "Milestone",
    description: "Diamond marker with outer glow",
    color: "#f5a623",
  },
  {
    type: "description",
    icon: "≡",
    label: "Description",
    description: "Plain text block — attaches to nearest task",
    color: "#bb9af7",
    monoIcon: true,
  },
  {
    type: "steps",
    icon: "☑",
    label: "Steps",
    description: "Checklist block — attaches to nearest task",
    color: "#9ece6a",
    monoIcon: true,
  },
  {
    type: "brainstorm",
    icon: "◉",
    label: "Brainstorm",
    description: "Free bullet list — attaches to nearest task",
    color: "#e0af68",
    monoIcon: true,
  },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSpawn: (type: SpawnableNodeType) => void;
}

export function CommandPalette({ open, onClose, onSpawn }: CommandPaletteProps) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) setCursor(0);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % ITEMS.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + ITEMS.length) % ITEMS.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onSpawn(ITEMS[cursor].type);
        onClose();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [open, cursor, onSpawn, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(2px)",
              zIndex: 40,
            }}
          />

          {/* Palette card */}
          <motion.div
            key="palette"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            style={{
              position: "absolute",
              top: "28%",
              left: "50%",
              translateX: "-50%",
              width: 380,
              background: "rgba(6,14,28,0.97)",
              border: "1px solid rgba(30,58,95,0.85)",
              borderRadius: 14,
              boxShadow:
                "0 28px 72px rgba(0,0,0,0.65), 0 0 0 1px rgba(100,255,218,0.04)",
              backdropFilter: "blur(24px)",
              overflow: "hidden",
              zIndex: 41,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: "1px solid rgba(30,58,95,0.55)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  color: "#2d4a6e",
                  textTransform: "uppercase",
                }}
              >
                Spawn Node
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  color: "#2d4a6e",
                }}
              >
                ↑↓ navigate &nbsp;·&nbsp; ↵ spawn &nbsp;·&nbsp; esc cancel
              </span>
            </div>

            {/* Items */}
            <div style={{ padding: "6px 0 8px" }}>
              {ITEMS.map((item, idx) => {
                const active = cursor === idx;
                const isFirst = idx === 0;
                const isFirstBlock = isBlockType(item.type) && (idx === 0 || !isBlockType(ITEMS[idx - 1].type));
                return (
                  <React.Fragment key={item.type}>
                    {/* Section divider before first block item */}
                    {isFirstBlock && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 16px 4px",
                        borderTop: isFirst ? "none" : "1px solid rgba(30,58,95,0.35)",
                        marginTop: isFirst ? 0 : 4,
                      }}>
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          color: "#2d4a6e",
                          textTransform: "uppercase",
                        }}>
                          Child Blocks — attaches to nearest task
                        </span>
                      </div>
                    )}
                    <div
                      onClick={() => { onSpawn(item.type); onClose(); }}
                      onMouseEnter={() => setCursor(idx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "9px 16px",
                        cursor: "pointer",
                        background: active ? `${item.color}12` : "transparent",
                        borderLeft: `2px solid ${active ? item.color : "transparent"}`,
                        transition: "background 0.1s, border-color 0.1s",
                      }}
                    >
                    {/* Icon badge */}
                    <span
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        border: `1px solid ${active ? item.color : "rgba(30,58,95,0.5)"}`,
                        background: active
                          ? `${item.color}18`
                          : "rgba(13,27,46,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: item.monoIcon ? 9 : 14,
                        fontFamily: item.monoIcon
                          ? "var(--font-mono)"
                          : "inherit",
                        fontWeight: item.monoIcon ? 700 : "inherit",
                        color: active ? item.color : "#4a6080",
                        transition: "all 0.12s",
                      }}
                    >
                      {item.icon}
                    </span>

                    {/* Text */}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: 600,
                          color: active ? item.color : "#8892b0",
                          letterSpacing: "0.03em",
                          transition: "color 0.12s",
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 11,
                          color: "#3d5070",
                          marginTop: 2,
                          lineHeight: 1.4,
                        }}
                      >
                        {item.description}
                      </div>
                    </div>

                    {/* Enter hint */}
                    {active && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: item.color,
                          opacity: 0.65,
                          flexShrink: 0,
                        }}
                      >
                        ↵
                      </span>
                    )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
