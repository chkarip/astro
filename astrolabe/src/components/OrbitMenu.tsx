import React, { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AISuggestion } from "../types";

interface OrbitMenuProps {
  visible: boolean;
  /** Screen-space position of the anchor (centre of the triggering node) */
  x: number;
  y: number;
  suggestions: AISuggestion[];
  loading: boolean;
  onSelect: (suggestion: AISuggestion) => void;
  onClose: () => void;
  /** Called when a suggestion is dragged to the canvas */
  onDragStart: (e: React.DragEvent, suggestion: AISuggestion) => void;
}

const ORBIT_RADIUS = 110;
const ITEM_SIZE = 46;

function LoadingRing() {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: ORBIT_RADIUS * 2 + ITEM_SIZE,
        height: ORBIT_RADIUS * 2 + ITEM_SIZE,
        border: "1.5px dashed rgba(245,166,35,0.5)",
        left: -(ORBIT_RADIUS + ITEM_SIZE / 2),
        top: -(ORBIT_RADIUS + ITEM_SIZE / 2),
      }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
    />
  );
}

export function OrbitMenu({
  visible,
  x,
  y,
  suggestions,
  loading,
  onSelect,
  onClose,
  onDragStart,
}: OrbitMenuProps) {
  const count = suggestions.length || 5;

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Full-screen backdrop to capture outside clicks */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleBackdropClick}
            style={{ cursor: "default" }}
          />

          {/* Orbit container — fixed-positioned at screen coords */}
          <motion.div
            className="fixed z-50 pointer-events-none"
            style={{ left: x, top: y }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
          >
            {/* Central hub dot */}
            <motion.div
              className="absolute rounded-full pointer-events-auto"
              style={{
                width: 14,
                height: 14,
                background: "#f5a623",
                left: -7,
                top: -7,
                boxShadow: "0 0 12px rgba(245,166,35,0.9)",
              }}
            />

            {/* Loading spinning ring */}
            {loading && <LoadingRing />}

            {/* Orbital items */}
            {suggestions.map((suggestion, i) => {
              const angle = (i / count) * 360 - 90; // start from top
              const rad = (angle * Math.PI) / 180;
              const itemX = Math.cos(rad) * ORBIT_RADIUS;
              const itemY = Math.sin(rad) * ORBIT_RADIUS;

              return (
                <motion.div
                  key={i}
                  className="absolute pointer-events-auto cursor-grab active:cursor-grabbing rounded-lg p-2 text-center"
                  style={{
                    width: ITEM_SIZE * 2.2,
                    left: itemX - ITEM_SIZE * 1.1,
                    top: itemY - ITEM_SIZE / 2,
                    background: "#112240",
                    border: "1.5px solid #2563eb",
                    boxShadow: "0 0 10px rgba(37,99,235,0.4)",
                    fontFamily: "var(--font-mono)",
                  }}
                  initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x: 0,
                    y: 0,
                  }}
                  exit={{ opacity: 0, scale: 0.2 }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 22,
                    delay: i * 0.06,
                  }}
                  draggable
                  onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, suggestion)}
                  onClick={() => onSelect(suggestion)}
                  whileHover={{
                    scale: 1.08,
                    borderColor: "#f5a623",
                    boxShadow: "0 0 14px rgba(245,166,35,0.5)",
                  }}
                >
                  <p
                    className="text-xs font-semibold leading-tight line-clamp-2"
                    style={{ color: "#ccd6f6", fontSize: 10 }}
                  >
                    {suggestion.title}
                  </p>
                  {suggestion.description && (
                    <p
                      className="mt-0.5 text-xs leading-tight line-clamp-2"
                      style={{ color: "#8892b0", fontSize: 9 }}
                    >
                      {suggestion.description}
                    </p>
                  )}
                  {/* Drag hint */}
                  <p
                    className="mt-1"
                    style={{ color: "#495670", fontSize: 8, fontFamily: "var(--font-mono)" }}
                  >
                    drag to canvas
                  </p>
                </motion.div>
              );
            })}

            {/* Connecting lines from hub to items */}
            <svg
              className="absolute pointer-events-none"
              style={{
                left: -(ORBIT_RADIUS + ITEM_SIZE),
                top: -(ORBIT_RADIUS + ITEM_SIZE),
                width: (ORBIT_RADIUS + ITEM_SIZE) * 2,
                height: (ORBIT_RADIUS + ITEM_SIZE) * 2,
              }}
            >
              {suggestions.map((_, i) => {
                const angle = (i / count) * 360 - 90;
                const rad = (angle * Math.PI) / 180;
                const cx = ORBIT_RADIUS + ITEM_SIZE;
                const cy = ORBIT_RADIUS + ITEM_SIZE;
                const tx = cx + Math.cos(rad) * ORBIT_RADIUS;
                const ty = cy + Math.sin(rad) * ORBIT_RADIUS;
                return (
                  <line
                    key={i}
                    x1={cx}
                    y1={cy}
                    x2={tx}
                    y2={ty}
                    stroke="rgba(37,99,235,0.3)"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                );
              })}
            </svg>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default OrbitMenu;
