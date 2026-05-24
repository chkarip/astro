import { useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NoteNodeData } from "../../types";

export function NoteNode({ id, data, selected }: NodeProps) {
  const { text, isEditing: isEditingProp, onTextCommit } =
    data as unknown as NoteNodeData;

  const [localText, setLocalText] = useState(text ?? "");
  const [editing, setEditing] = useState(isEditingProp ?? !text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setLocalText(text ?? ""); }, [text]);
  useEffect(() => {
    if (isEditingProp) setEditing(true);
  }, [isEditingProp]);
  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    onTextCommit?.(id, localText.trim());
  }, [id, localText, onTextCommit]);

  return (
    <div
      className="relative"
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{
        minWidth: 140,
        maxWidth: 300,
        padding: "9px 18px",
        borderRadius: 999,
        background: editing
          ? "rgba(100,255,218,0.08)"
          : "rgba(100,255,218,0.05)",
        border: selected
          ? "1px solid rgba(100,255,218,0.35)"
          : "1px solid rgba(100,255,218,0.1)",
        boxShadow: selected
          ? "0 0 14px rgba(100,255,218,0.1)"
          : "none",
        cursor: editing ? "text" : "default",
        transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") commit();
            // Prevent ReactFlow from stealing keyboard events
            e.stopPropagation();
          }}
          rows={2}
          placeholder="Type a note…"
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            width: "100%",
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: "#ccd6f6",
            lineHeight: 1.65,
          }}
        />
      ) : (
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: localText ? "#a8b2c8" : "#3d5070",
            lineHeight: 1.65,
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {localText || "Double-click to edit…"}
        </p>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#64ffda", width: 7, height: 7, border: "none", opacity: 0.5 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#64ffda", width: 7, height: 7, border: "none", opacity: 0.5 }}
      />
    </div>
  );
}
