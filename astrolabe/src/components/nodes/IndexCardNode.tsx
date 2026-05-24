import React, { useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import type { IndexCardData, NodeStatus } from "../../types";
import { INDEX_CARD_STATUS_CONFIG as STATUS_CONFIG, INDEX_CARD_STATUS_CYCLE as STATUS_CYCLE } from "../../constants/status";

// ─── Completion Bloom ──────────────────────────────────────────────────────────
function CompletionBloom({ onDone }: { onDone: () => void }) {
  const particles = Array.from({ length: 12 }, (_, i) => i);
  const radius = 60;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 100 }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.9, delay: 0.4 }}
      onAnimationComplete={onDone}
    >
      {particles.map((i) => {
        const angle = (i / particles.length) * 360;
        const rad = (angle * Math.PI) / 180;
        const tx = Math.cos(rad) * radius;
        const ty = Math.sin(rad) * radius;
        return (
          <motion.span
            key={i}
            className="absolute block rounded-full"
            style={{
              width: i % 3 === 0 ? 8 : 5,
              height: i % 3 === 0 ? 8 : 5,
              background:
                i % 4 === 0
                  ? "#f5a623"
                  : i % 3 === 0
                  ? "#64ffda"
                  : "#4ade80",
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.02 }}
          />
        );
      })}
    </motion.div>
  );
}

export function IndexCardNode({ id, data, selected }: NodeProps) {
  const {
    title, description, status, isEditing,
    onComplete, onUncomplete, onOrbit, onStatusChange, onTitleCommit, onDescriptionCommit,
  } = data as unknown as IndexCardData;

  const [blooming, setBlooming] = useState(false);
  const [hovered, setHovered] = useState(false);
  // "title" | "description" | null — which field is being edited right now
  const [editingField, setEditingField] = useState<"title" | "description" | null>(
    isEditing ? "title" : null
  );
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description ?? "");
  const nodeRef = useRef<HTMLDivElement>(null);

  // Sync props → local state when they change externally
  useEffect(() => { setLocalTitle(title); }, [title]);
  useEffect(() => { setLocalDescription(description ?? ""); }, [description]);
  // When parent sets isEditing=true (new card), enter title-edit mode
  useEffect(() => { if (isEditing) setEditingField("title"); }, [isEditing]);

  const isDone = status === "done";
  const currentStatus: NodeStatus = (status as NodeStatus) ?? "pending";
  const { color: statusColor, bgTint } = STATUS_CONFIG[currentStatus];

  const handleStatusCycle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const idx = STATUS_CYCLE.indexOf(currentStatus);
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      if (next === "done" && !isDone) setBlooming(true);
      onStatusChange?.(id, next);
    },
    [id, currentStatus, isDone, onStatusChange]
  );

  const commitTitle = useCallback(() => {
    setEditingField(null);
    onTitleCommit?.(id, localTitle.trim() || "Untitled");
  }, [id, localTitle, onTitleCommit]);

  const commitDescription = useCallback(() => {
    setEditingField(null);
    onDescriptionCommit?.(id, localDescription.trim());
  }, [id, localDescription, onDescriptionCommit]);

  const handleCheck = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked && !isDone) {
        setBlooming(true);
        onComplete(id);
      } else if (!e.target.checked && isDone) {
        onUncomplete?.(id);
      }
    },
    [id, isDone, onComplete, onUncomplete]
  );

  const handleOrbit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = nodeRef.current?.getBoundingClientRect();
      if (rect) {
        onOrbit(id, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    },
    [id, onOrbit]
  );

  // Shared keydown handler for both edit inputs
  const inputKeyDown = useCallback(
    (commit: () => void) => (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === "Escape") commit();
      e.stopPropagation();
    },
    []
  );

  return (
    <div
      ref={nodeRef}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Node card */}
      <motion.div
        className="relative min-w-[200px] max-w-[280px] rounded-sm overflow-visible"
        style={{
          background: bgTint ? `linear-gradient(${bgTint}, ${bgTint}), #112240` : "#112240",
          border: `1.5px solid ${selected ? "#2563eb" : "#1e3a5f"}`,
          borderLeft: `3px solid ${statusColor}`,
          boxShadow: selected ? `4px 4px 0 #2563eb` : `4px 4px 0 #1e3a5f`,
          opacity: isDone ? 0.7 : 1,
          fontFamily: "var(--font-mono)",
        }}
        animate={selected ? { scale: 1.02 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >

        <div className="px-3 pt-2 pb-3">
          {/* Top row: checkbox + title */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={isDone}
              onChange={handleCheck}
              className="mt-0.5 flex-shrink-0 cursor-pointer accent-[#4ade80]"
              style={{ width: 14, height: 14 }}
            />
            {editingField === "title" ? (
              <input
                autoFocus
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={inputKeyDown(commitTitle)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Enter goal title…"
                className="nodrag text-xs font-semibold bg-transparent outline-none border-b border-blue-600 w-full"
                style={{ color: "#ccd6f6", fontFamily: "var(--font-mono)" }}
              />
            ) : (
              <span
                className="nodrag text-xs font-semibold leading-snug cursor-text select-text"
                title="Double-click to edit"
                onDoubleClick={(e) => { e.stopPropagation(); setEditingField("title"); }}
                style={{
                  color: isDone ? "#8892b0" : "#ccd6f6",
                  textDecoration: isDone ? "line-through" : "none",
                }}
              >
                {title || <span style={{ color: "#495670" }}>Untitled</span>}
              </span>
            )}
          </div>

          {/* Description — double-click to edit */}
          <div className="mt-1.5">
            {editingField === "description" ? (
              <textarea
                autoFocus
                rows={3}
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={commitDescription}
                onKeyDown={inputKeyDown(commitDescription)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add details…"
                className="nodrag w-full text-xs bg-transparent outline-none border border-blue-600 rounded px-1 py-0.5 resize-none"
                style={{ color: "#8892b0", fontFamily: "var(--font-mono)" }}
              />
            ) : (
              <p
                className="nodrag text-xs leading-relaxed cursor-text select-text min-h-[1rem]"
                title="Double-click to edit"
                onDoubleClick={(e) => { e.stopPropagation(); setEditingField("description"); }}
                style={{ color: description ? "#8892b0" : "#2d4a6a" }}
              >
                {description || "double-click to add details…"}
              </p>
            )}
          </div>

          {/* Status pill */}
          <div
            className="nodrag flex items-center gap-1 mt-2 cursor-pointer select-none"
            onClick={handleStatusCycle}
            title="Click to cycle status"
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 9,
                color: statusColor,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                lineHeight: 1,
              }}
            >
              {STATUS_CONFIG[currentStatus].label}
            </span>
          </div>
        </div>

        {/* Bloom overlay */}
        <AnimatePresence>
          {blooming && (
            <CompletionBloom onDone={() => setBlooming(false)} />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Orbit trigger ! button — hidden until hover */}
      <AnimatePresence>
        {hovered && !isDone && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            onClick={handleOrbit}
            className="absolute -top-3 -right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer"
            style={{
              background: "#f5a623",
              color: "#0d1b2e",
              boxShadow: "0 0 8px rgba(245,166,35,0.8)",
              zIndex: 10,
            }}
          >
            !
          </motion.button>
        )}
      </AnimatePresence>

      {/* React Flow handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#2563eb", width: 8, height: 8, border: "none" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#2563eb", width: 8, height: 8, border: "none" }}
      />
    </div>
  );
}

export default IndexCardNode;
