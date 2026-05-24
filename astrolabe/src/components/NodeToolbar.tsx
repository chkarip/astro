import { motion } from "framer-motion";
import type { LayoutMode } from "../types";

export type SpawnableNodeType =
  | "index_card"
  | "note"
  | "milestone"
  | "description"
  | "steps"
  | "brainstorm";

/** Node types that are standalone canvas nodes (not child blocks). */
export type SpawnableCanvasType = "index_card" | "note" | "milestone";

/** Node types that attach as child blocks inside a Task node. */
export type SpawnableBlockType = "description" | "steps" | "brainstorm";

export function isBlockType(t: SpawnableNodeType): t is SpawnableBlockType {
  return t === "description" || t === "steps" || t === "brainstorm";
}

interface ToolbarItem {
  type: SpawnableNodeType;
  icon: string;
  label: string;
  color: string;
  monoIcon?: boolean;
}

const NODE_ITEMS: ToolbarItem[] = [
  { type: "index_card", icon: "🗂",  label: "Card",      color: "#7aa2f7" },
  { type: "note",       icon: "✦",   label: "Note",      color: "#64ffda" },
  { type: "milestone",  icon: "◆",   label: "Milestone", color: "#f5a623" },
];

const BLOCK_ITEMS: ToolbarItem[] = [
  { type: "description", icon: "≡",  label: "Description", color: "#bb9af7" },
  { type: "steps",       icon: "☑",  label: "Steps",       color: "#9ece6a" },
  { type: "brainstorm",  icon: "◉",  label: "Brainstorm",  color: "#e0af68" },
];

const ITEMS = [...NODE_ITEMS, ...BLOCK_ITEMS];

interface NodeToolbarProps {
  equipped: SpawnableNodeType | null;
  onEquip: (type: SpawnableNodeType | null) => void;
  onTidy?: () => void;
  layoutMode?: LayoutMode;
  onLayoutModeChange?: (mode: LayoutMode) => void;
}

export function NodeToolbar({ equipped, onEquip, onTidy, layoutMode = "horizontal", onLayoutModeChange }: NodeToolbarProps) {
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.5 }}
      style={{
        position: "absolute",
        bottom: 52,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "7px 10px",
        background: "rgba(6,14,28,0.9)",
        border: "1px solid rgba(30,58,95,0.75)",
        borderRadius: 50,
        backdropFilter: "blur(14px)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(30,58,95,0.35)",
        zIndex: 20,
        pointerEvents: "all",
      }}
    >
      {/* Divider label */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "#2d4a6e",
          paddingRight: 6,
          userSelect: "none",
          textTransform: "uppercase",
        }}
      >
        Spawn
      </span>

      {/* Node spawn items */}
      {NODE_ITEMS.map((item) => {
        const active = equipped === item.type;
        return (
          <motion.button
            key={item.type}
            onClick={() => onEquip(active ? null : item.type)}
            whileHover={{ scale: 1.14 }}
            whileTap={{ scale: 0.88 }}
            title={`${item.label}${active ? " (click canvas to place)" : ""}`}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: `1.5px solid ${active ? item.color : "rgba(30,58,95,0.55)"}`,
              background: active ? `${item.color}20` : "transparent",
              color: active ? item.color : "#4a6080",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: item.monoIcon ? 9 : 15,
              fontFamily: item.monoIcon ? "var(--font-mono)" : "inherit",
              fontWeight: item.monoIcon ? 700 : "inherit",
              boxShadow: active ? `0 0 14px ${item.color}50` : "none",
              transition: "all 0.15s",
            }}
          >
            {item.icon}
            {active && (
              <motion.span
                layoutId="toolbar-pip"
                style={{
                  position: "absolute",
                  bottom: -5,
                  left: "50%",
                  translateX: "-50%",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: item.color,
                  boxShadow: `0 0 6px ${item.color}`,
                }}
              />
            )}
          </motion.button>
        );
      })}

      {/* Divider between node and block items */}
      <span
        style={{
          width: 1,
          height: 22,
          background: "rgba(30,58,95,0.55)",
          margin: "0 4px",
          flexShrink: 0,
        }}
      />

      {/* Block items label */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "#2d4a6e",
          paddingRight: 2,
          userSelect: "none",
          textTransform: "uppercase",
        }}
      >
        Block
      </span>

      {/* Child block items */}
      {BLOCK_ITEMS.map((item) => {
        const active = equipped === item.type;
        return (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/astrolabe-block-type", item.type);
              e.dataTransfer.effectAllowed = "copy";
              onEquip(null);
            }}
            style={{ display: "contents" }}
          >
          <motion.button
            onClick={() => onEquip(active ? null : item.type)}
            whileHover={{ scale: 1.14 }}
            whileTap={{ scale: 0.88 }}
            title={`${item.label}${active ? " (click task to attach)" : " — click to equip, or drag onto a task"}`}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: `1.5px solid ${active ? item.color : "rgba(30,58,95,0.55)"}`,
              background: active ? `${item.color}20` : "transparent",
              color: active ? item.color : "#4a6080",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              boxShadow: active ? `0 0 14px ${item.color}50` : "none",
              transition: "all 0.15s",
            }}
          >
            {item.icon}
            {active && (
              <motion.span
                layoutId="toolbar-pip"
                style={{
                  position: "absolute",
                  bottom: -5,
                  left: "50%",
                  translateX: "-50%",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: item.color,
                  boxShadow: `0 0 6px ${item.color}`,
                }}
              />
            )}
          </motion.button>
          </div>
        );
      })}

      {/* Cursor hint when equipped */}
      {equipped && (
        <motion.span
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          style={{
            marginLeft: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.1em",
            color:
              ITEMS.find((i) => i.type === equipped)?.color ?? "#64ffda",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          {isBlockType(equipped) ? "→ click or drop on task" : "click canvas"}
        </motion.span>
      )}

      {/* Divider */}
      {onTidy && (
        <span
          style={{
            width: 1,
            height: 22,
            background: "rgba(30,58,95,0.55)",
            margin: "0 6px",
            flexShrink: 0,
          }}
        />
      )}

      {/* Layout mode toggles */}
      {onLayoutModeChange && (
        <>
          {(["tree", "horizontal"] as LayoutMode[]).map((mode) => {
            const active = layoutMode === mode;
            const label = mode === "tree" ? "Tree" : "Flow";
            const icon  = mode === "tree" ? "⇓" : "⇒";
            return (
              <motion.button
                key={mode}
                onClick={() => onLayoutModeChange(mode)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title={mode === "tree" ? "Tree View (top → bottom)" : "Horizontal Flow (left → right)"}
                style={{
                  height: 30,
                  padding: "0 9px",
                  borderRadius: 5,
                  border: `1.5px solid ${active ? "#4A9EFF" : "rgba(30,58,95,0.55)"}`,
                  background: active ? "rgba(74,158,255,0.14)" : "transparent",
                  color: active ? "#4A9EFF" : "#4a6080",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontWeight: active ? 700 : 400,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 13 }}>{icon}</span>
                {label}
              </motion.button>
            );
          })}
          <span
            style={{
              width: 1,
              height: 22,
              background: "rgba(30,58,95,0.55)",
              margin: "0 4px",
              flexShrink: 0,
            }}
          />
        </>
      )}

      {/* Tidy / Auto-layout button */}
      {onTidy && (
        <motion.button
          onClick={onTidy}
          whileHover={{ scale: 1.14 }}
          whileTap={{ scale: 0.88 }}
          title="Tidy — auto-layout all nodes"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "1.5px solid rgba(30,58,95,0.55)",
            background: "transparent",
            color: "#4a6080",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            boxShadow: "none",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#64ffda";
            (e.currentTarget as HTMLButtonElement).style.color = "#64ffda";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 14px #64ffda50";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(30,58,95,0.55)";
            (e.currentTarget as HTMLButtonElement).style.color = "#4a6080";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
          }}
        >
          🧹
        </motion.button>
      )}
    </motion.div>
  );
}
