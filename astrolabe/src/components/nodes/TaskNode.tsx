import React, { useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps, useStore } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import { TASK_STATUS_CONFIG as STATUS_CONFIG, TASK_STATUS_CYCLE as STATUS_CYCLE } from "../../constants/status";
import type {
  TaskData,
  TaskStatus,
  ChildBlock,
  DescriptionBlock,
  StepsBlock,
  BrainstormBlock,
  BrainstormBullet,
} from "../../types";

// ─── Child block sub-components ───────────────────────────────────────────────

function DescriptionBlockView({
  block, onUpdate, onDelete,
}: { block: DescriptionBlock; onUpdate: (b: ChildBlock) => void; onDelete: () => void }) {
  const [content, setContent] = useState(block.content);
  useEffect(() => { setContent(block.content); }, [block.content]);

  return (
    <div style={{ padding: "6px 10px 8px", borderTop: "1px solid #1e3a5f" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>Description</span>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#4a6080", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => onUpdate({ ...block, content })}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); } e.stopPropagation(); }}
        placeholder="Add description…"
        className="nodrag"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: "1px solid #1e3a5f40",
          color: "#8892b0",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          width: "100%",
          resize: "none",
          outline: "none",
          minHeight: 52,
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}

function StepsBlockView({
  block, onUpdate, onDelete,
}: { block: StepsBlock; onUpdate: (b: ChildBlock) => void; onDelete: () => void }) {
  const [items, setItems] = useState(block.items);
  useEffect(() => { setItems(block.items); }, [block.items]);

  const flush = useCallback((newItems: StepsBlock["items"]) => {
    setItems(newItems);
    onUpdate({ ...block, items: newItems });
  }, [block, onUpdate]);

  return (
    <div style={{ padding: "6px 10px 8px", borderTop: "1px solid #1e3a5f" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>Steps</span>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#4a6080", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {items.map((item, i) => (
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <input
            type="checkbox"
            checked={item.done}
            onChange={(e) => flush(items.map((it, j) => j === i ? { ...it, done: e.target.checked } : it))}
            style={{ width: 12, height: 12, accentColor: "#22C55E", flexShrink: 0, cursor: "pointer" }}
            className="nodrag"
          />
          <input
            type="text"
            value={item.text}
            onChange={(e) => setItems(items.map((it, j) => j === i ? { ...it, text: e.target.value } : it))}
            onBlur={() => onUpdate({ ...block, items })}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); flush([...items.slice(0, i + 1), { id: crypto.randomUUID(), text: "", done: false }, ...items.slice(i + 1)]); }
              if (e.key === "Backspace" && item.text === "" && items.length > 1) { e.preventDefault(); flush(items.filter((_, j) => j !== i)); }
              e.stopPropagation();
            }}
            placeholder="Step…"
            className="nodrag"
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid #1e3a5f20",
              color: item.done ? "#4a6080" : "#8892b0",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              width: "100%",
              outline: "none",
              textDecoration: item.done ? "line-through" : "none",
            }}
          />
        </div>
      ))}
      <button
        onClick={() => flush([...items, { id: crypto.randomUUID(), text: "", done: false }])}
        className="nodrag"
        style={{
          background: "transparent",
          border: "1px dashed #1e3a5f",
          borderRadius: 3,
          color: "#4a6080",
          fontSize: 10,
          padding: "2px 6px",
          cursor: "pointer",
          width: "100%",
          marginTop: 2,
          fontFamily: "var(--font-mono)",
        }}
      >
        + Step
      </button>
    </div>
  );
}

function BrainstormBlockView({
  block, onUpdate, onDelete,
}: { block: BrainstormBlock; onUpdate: (b: ChildBlock) => void; onDelete: () => void }) {
  const [bullets, setBullets] = useState<BrainstormBullet[]>(block.bullets);
  useEffect(() => { setBullets(block.bullets); }, [block.bullets]);

  const flush = useCallback((b: BrainstormBullet[]) => {
    setBullets(b);
    onUpdate({ ...block, bullets: b });
  }, [block, onUpdate]);

  return (
    <div style={{ padding: "6px 10px 8px", borderTop: "1px solid #1e3a5f" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#4a6080", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>Brainstorm</span>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#4a6080", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {bullets.map((bullet, i) => (
        // Use bullet.id (not array index) as key so React correctly tracks
        // identity when bullets are deleted or reordered.
        <div key={bullet.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
          <span style={{ color: "#4a6080", marginTop: 2, flexShrink: 0, fontSize: 10 }}>•</span>
          <input
            type="text"
            value={bullet.text}
            onChange={(e) => setBullets(bullets.map((b, j) => j === i ? { ...b, text: e.target.value } : b))}
            onBlur={() => onUpdate({ ...block, bullets })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flush([...bullets.slice(0, i + 1), { id: crypto.randomUUID(), text: "" }, ...bullets.slice(i + 1)]);
              }
              if (e.key === "Backspace" && bullet.text === "" && bullets.length > 1) {
                e.preventDefault();
                flush(bullets.filter((_, j) => j !== i));
              }
              e.stopPropagation();
            }}
            placeholder="Idea…"
            className="nodrag"
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid #1e3a5f20",
              color: "#8892b0",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              width: "100%",
              outline: "none",
            }}
          />
        </div>
      ))}
      <button
        onClick={() => flush([...bullets, { id: crypto.randomUUID(), text: "" }])}
        className="nodrag"
        style={{
          background: "transparent",
          border: "1px dashed #1e3a5f",
          borderRadius: 3,
          color: "#4a6080",
          fontSize: 10,
          padding: "2px 6px",
          cursor: "pointer",
          width: "100%",
          marginTop: 2,
          fontFamily: "var(--font-mono)",
        }}
      >
        + Idea
      </button>
    </div>
  );
}

function ChildBlockRenderer({
  block, onUpdate, onDelete,
}: { block: ChildBlock; onUpdate: (b: ChildBlock) => void; onDelete: () => void }) {
  if (block.type === "description") return <DescriptionBlockView block={block} onUpdate={onUpdate} onDelete={onDelete} />;
  if (block.type === "steps") return <StepsBlockView block={block} onUpdate={onUpdate} onDelete={onDelete} />;
  return <BrainstormBlockView block={block} onUpdate={onUpdate} onDelete={onDelete} />;
}

// ─── Main TaskNode ─────────────────────────────────────────────────────────────

export function TaskNode({ id, data, selected }: NodeProps) {
  const {
    title, status, collapsed, childBlocks = [],
    isEditing,
    onStatusChange, onTitleCommit, onBlocksChange,
    onToggleCollapse, onAddChildTask,
  } = data as unknown as TaskData;

  // Derive child task info directly from the React Flow store
  const allNodes = useStore((s) => s.nodes);
  const childTasks = allNodes.filter((n) => n.parentId === id && n.type === "task");
  const childCount = childTasks.length;
  const doneCount = childTasks.filter((n) => (n.data as TaskData).status === "done").length;
  const hasBlockedChild = childTasks.some((n) => (n.data as TaskData).status === "blocked");

  // Auto-mark parent done when all children are done
  useEffect(() => {
    if (childCount > 0 && doneCount === childCount && status !== "done") {
      onStatusChange?.(id, "done");
    }
  }, [childCount, doneCount, status, id, onStatusChange]);

  const [editingTitle, setEditingTitle] = useState(isEditing ?? false);
  const [localTitle, setLocalTitle] = useState(title);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const blockMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalTitle(title); }, [title]);
  useEffect(() => { if (isEditing) setEditingTitle(true); }, [isEditing]);

  const isDone = status === "done";
  const currentStatus: TaskStatus = (status as TaskStatus) ?? "pending";
  const { border: borderColor } = STATUS_CONFIG[currentStatus];

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    onTitleCommit?.(id, localTitle.trim() || "Untitled");
  }, [id, localTitle, onTitleCommit]);

  const handleStatusClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = STATUS_CYCLE.indexOf(currentStatus);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onStatusChange?.(id, next);
  }, [id, currentStatus, onStatusChange]);

  const addBlock = useCallback((type: ChildBlock["type"]) => {
    setShowBlockMenu(false);
    let newBlock: ChildBlock;
    if (type === "description") {
      newBlock = { type: "description", id: crypto.randomUUID(), content: "" };
    } else if (type === "steps") {
      newBlock = { type: "steps", id: crypto.randomUUID(), items: [{ id: crypto.randomUUID(), text: "", done: false }] };
    } else {
      newBlock = { type: "brainstorm", id: crypto.randomUUID(), bullets: [{ id: crypto.randomUUID(), text: "" }] };
    }
    onBlocksChange?.(id, [...childBlocks, newBlock]);
  }, [id, childBlocks, onBlocksChange]);

  // Close block menu on outside click
  useEffect(() => {
    if (!showBlockMenu) return;
    const handler = (e: MouseEvent) => {
      if (!blockMenuRef.current?.contains(e.target as Node)) setShowBlockMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBlockMenu]);

  const hasFooter = childBlocks.length > 0 || true; // always show footer buttons

  return (
    <div style={{ position: "relative" }}>
      <motion.div
        style={{
          background: "#0f1e33",
          border: `1.5px solid ${selected ? "#4A9EFF" : "#1e3a5f"}`,
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: 6,
          minWidth: 210,
          maxWidth: 290,
          boxShadow: selected
            ? `0 0 0 1px #4A9EFF40, 4px 4px 0 #1e3a5f`
            : `2px 2px 8px rgba(0,0,0,0.5)`,
          opacity: isDone ? 0.65 : 1,
          fontFamily: "var(--font-mono)",
          overflow: "visible",
        }}
        animate={selected ? { scale: 1.01 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "8px 10px 7px",
            background: "rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "flex-start",
            gap: 7,
          }}
        >
          {/* Status dot — click to cycle */}
          <button
            onClick={handleStatusClick}
            title={`${STATUS_CONFIG[currentStatus].label} — click to cycle`}
            className="nodrag"
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: borderColor,
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
              marginTop: 4,
              boxShadow: `0 0 5px ${borderColor}90`,
              padding: 0,
            }}
          />

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingTitle ? (
              <input
                autoFocus
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                  if (e.key === "Escape") { setEditingTitle(false); setLocalTitle(title); }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Task title…"
                className="nodrag"
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #4A9EFF",
                  color: "#ccd6f6",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  width: "100%",
                  outline: "none",
                }}
              />
            ) : (
              <div
                onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
                style={{
                  color: isDone ? "#6b7280" : "#ccd6f6",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.35,
                  textDecoration: isDone ? "line-through" : "none",
                  cursor: "text",
                  wordBreak: "break-word",
                  userSelect: "none",
                }}
              >
                {title || <span style={{ color: "#3a5070" }}>Untitled Task</span>}
              </div>
            )}
          </div>

          {/* Collapse toggle — only when has child tasks */}
          {childCount > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(id); }}
              title={collapsed ? "Expand children" : "Collapse children"}
              className="nodrag"
              style={{
                background: "none",
                border: "none",
                color: "#4a6080",
                cursor: "pointer",
                fontSize: 9,
                padding: "0 2px",
                lineHeight: 1,
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {collapsed ? "▶" : "▼"}
            </button>
          )}
        </div>

        {/* ── Progress / Blocked badges ──────────────────────────────────── */}
        {(childCount > 0 || hasBlockedChild) && (
          <div
            style={{
              padding: "3px 10px 4px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderBottom: childBlocks.length > 0 ? "1px solid #1e3a5f" : "none",
            }}
          >
            {childCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  color: doneCount === childCount ? "#22C55E" : "#6b7a8d",
                  background: doneCount === childCount ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                  padding: "1px 7px",
                  borderRadius: 3,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                }}
              >
                {doneCount}/{childCount} done
              </span>
            )}
            {hasBlockedChild && (
              <span
                style={{
                  fontSize: 10,
                  color: "#EF4444",
                  background: "rgba(239,68,68,0.1)",
                  padding: "1px 7px",
                  borderRadius: 3,
                  fontFamily: "var(--font-mono)",
                }}
              >
                ⚠ blocked
              </span>
            )}
          </div>
        )}

        {/* ── Child blocks ───────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {!collapsed && childBlocks.map((block) => (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              <ChildBlockRenderer
                block={block}
                onUpdate={(updated) => onBlocksChange?.(id, childBlocks.map((b) => b.id === updated.id ? updated : b))}
                onDelete={() => onBlocksChange?.(id, childBlocks.filter((b) => b.id !== block.id))}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Footer: + buttons ──────────────────────────────────────────── */}
        {hasFooter && (
          <div
            style={{
              padding: "5px 8px",
              display: "flex",
              justifyContent: "flex-end",
              gap: 4,
              borderTop: childBlocks.length > 0 ? "1px solid #1e3a5f" : "none",
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onAddChildTask?.(id); }}
              title="Add child task"
              className="nodrag"
              style={footerBtnStyle}
            >
              + Task
            </button>

            <div ref={blockMenuRef} style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowBlockMenu((v) => !v); }}
                title="Add content block"
                className="nodrag"
                style={footerBtnStyle}
              >
                + Block ▾
              </button>
              <AnimatePresence>
                {showBlockMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    className="nodrag nopan"
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 4px)",
                      right: 0,
                      background: "#0a1628",
                      border: "1px solid #1e3a5f",
                      borderRadius: 6,
                      padding: "4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      zIndex: 9000,
                      minWidth: 136,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                    }}
                  >
                    {[
                      { type: "description" as const, icon: "📝", label: "Description" },
                      { type: "steps" as const, icon: "☑", label: "Steps" },
                      { type: "brainstorm" as const, icon: "💡", label: "Brainstorm" },
                    ].map(({ type, icon, label }) => (
                      <button
                        key={type}
                        onClick={(e) => { e.stopPropagation(); addBlock(type); }}
                        style={blockMenuItemStyle}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(74,158,255,0.1)"; e.currentTarget.style.color = "#ccd6f6"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8892b0"; }}
                      >
                        <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>

      {/* React Flow connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#1e3a5f", border: "1.5px solid #2d5080", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#1e3a5f", border: "1.5px solid #2d5080", width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#1e3a5f", border: "1.5px solid #2d5080", width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "#1e3a5f", border: "1.5px solid #2d5080", width: 8, height: 8 }}
      />
    </div>
  );
}

// ─── Style constants ───────────────────────────────────────────────────────────

const footerBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #1e3a5f",
  borderRadius: 4,
  color: "#4a6080",
  cursor: "pointer",
  fontSize: 10,
  padding: "2px 7px",
  fontFamily: "var(--font-mono)",
  transition: "all 0.12s",
};

const blockMenuItemStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#8892b0",
  fontSize: 11,
  padding: "5px 8px",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 3,
  fontFamily: "var(--font-mono)",
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: "100%",
  transition: "all 0.1s",
};
