import { useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import type { MilestoneNodeData } from "../../types";

export function MilestoneNode({ id, data, selected }: NodeProps) {
  const { label, isEditing: isEditingProp, onLabelCommit } =
    data as unknown as MilestoneNodeData;

  const [localLabel, setLocalLabel] = useState(label ?? "");
  const [editing, setEditing] = useState(isEditingProp ?? false);
  const inputRef = useRef<HTMLInputElement>(null);
  const SIZE = 96;
  const OUTER = SIZE * 1.55;

  useEffect(() => { setLocalLabel(label ?? ""); }, [label]);
  useEffect(() => {
    if (isEditingProp) setEditing(true);
  }, [isEditingProp]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    onLabelCommit?.(id, localLabel.trim() || "Milestone");
  }, [id, localLabel, onLabelCommit]);

  return (
    <div
      className="relative"
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        width: OUTER,
        height: OUTER,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Outer glow ring */}
      <motion.div
        style={{
          position: "absolute",
          width: SIZE + 16,
          height: SIZE + 16,
          transform: "rotate(45deg)",
          borderRadius: 6,
          border: "1px solid rgba(245,166,35,0.25)",
          pointerEvents: "none",
        }}
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.07, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Diamond body */}
      <motion.div
        style={{
          position: "absolute",
          width: SIZE,
          height: SIZE,
          transform: "rotate(45deg)",
          borderRadius: 4,
          background: selected
            ? "rgba(245,166,35,0.2)"
            : "rgba(245,166,35,0.1)",
          border: `2px solid ${selected ? "#f5a623" : "rgba(245,166,35,0.55)"}`,
          boxShadow: selected
            ? "0 0 28px rgba(245,166,35,0.8), 0 0 56px rgba(245,166,35,0.3)"
            : "0 0 18px rgba(245,166,35,0.45), 0 0 36px rgba(245,166,35,0.15)",
        }}
        animate={
          selected
            ? {}
            : {
                boxShadow: [
                  "0 0 18px rgba(245,166,35,0.45), 0 0 36px rgba(245,166,35,0.15)",
                  "0 0 26px rgba(245,166,35,0.65), 0 0 48px rgba(245,166,35,0.25)",
                  "0 0 18px rgba(245,166,35,0.45), 0 0 36px rgba(245,166,35,0.15)",
                ],
              }
        }
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Label — static display or inline input */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          maxWidth: SIZE * 0.72,
          padding: "0 4px",
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); commit(); }
              e.stopPropagation();
            }}
            placeholder="Milestone"
            className="nodrag"
            style={{
              background: "rgba(245,166,35,0.08)",
              border: "none",
              borderBottom: "1px solid rgba(245,166,35,0.5)",
              outline: "none",
              width: SIZE * 0.68,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.07em",
              color: "#f5a623",
              textShadow: "0 0 10px rgba(245,166,35,0.8)",
              textAlign: "center",
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.07em",
              color: selected ? "#f5a623" : "#e8a020",
              textShadow: "0 0 10px rgba(245,166,35,0.8)",
              wordBreak: "break-word",
              lineHeight: 1.4,
              cursor: "default",
            }}
          >
            {localLabel || "Milestone"}
          </span>
        )}
      </div>

      {/* Handles at the cardinal points of the diamond */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#f5a623", width: 8, height: 8, border: "none", top: 6 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#f5a623", width: 8, height: 8, border: "none", bottom: 6 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#f5a623", width: 8, height: 8, border: "none", left: 6 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#f5a623", width: 8, height: 8, border: "none", right: 6 }}
      />
    </div>
  );
}
