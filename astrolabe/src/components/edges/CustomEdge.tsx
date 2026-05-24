import {
  type EdgeProps,
  EdgeLabelRenderer,
  getBezierPath,
  type Position,
} from "@xyflow/react";
import { useContext } from "react";
import { AIActivityContext } from "../../context/AIActivityContext";

/**
 * CustomEdge — luminous fiber-optic Bezier filaments.
 *
 * Visual layers (back → front):
 *   1. Outer diffuse halo  (blurred wide stroke)
 *   2. Fiber casing        (semi-transparent body)
 *   3. Inner bright core   (thin high-opacity streak)
 *   4. Shimmer pulse       (animated short dashes, always running)
 *   5. AI particle trails  (glow dots flowing along the path, only while AI is active)
 *
 * Curves use dynamic Bezier curvature: tighter for nearby nodes, rounder for
 * distant ones, which lets connections naturally arc around other content.
 */

const PARTICLE_COUNT = 3;
/** Total dash cycle length for the shimmer (dash + gap). */
const SHIMMER_CYCLE = 54;

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  label,
  selected,
}: EdgeProps) {
  const { isAIActive } = useContext(AIActivityContext);

  // Unique ids — scoped per edge so filters/paths don't collide in the SVG.
  const pathId        = `fiber-path-${id}`;
  const glowFilterId  = `fiber-glow-${id}`;
  const ptclFilterId  = `ptcl-glow-${id}`;

  // Dynamic curvature: closer nodes get a tighter pull, distant nodes arc more.
  const dist      = Math.hypot(targetX - sourceX, targetY - sourceY);
  const curvature = Math.max(0.2, Math.min(0.65, 130 / dist));

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition as Position,
    targetX,
    targetY,
    targetPosition: targetPosition as Position,
    curvature,
  });

  const baseColor = selected ? "#64ffda" : "#4A9EFF";
  const coreColor = selected ? "#e0fff8" : "#c8e8ff";
  const haloColor = selected ? "#00b899" : "#1540a0";

  return (
    <>
      <defs>
        {/* Outer halo blur — applied only to the widest stroke layer */}
        <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
          </feMerge>
        </filter>

        {/* Particle glow — renders the dot twice blurred then sharp on top */}
        <filter id={ptclFilterId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hidden named path — mpath references animate along this geometry */}
      <path id={pathId} d={edgePath} fill="none" stroke="none" />

      {/* ── Layer 1: Outer diffuse halo ─────────────────────────────────── */}
      <path
        d={edgePath}
        fill="none"
        stroke={haloColor}
        strokeWidth={10}
        strokeOpacity={0.18}
        filter={`url(#${glowFilterId})`}
      />

      {/* ── Layer 2: Fiber casing (the glass jacket) ────────────────────── */}
      <path
        d={edgePath}
        fill="none"
        stroke={baseColor}
        strokeWidth={2.5}
        strokeOpacity={0.28}
      />

      {/* ── Layer 3: Inner bright core (the light channel) ──────────────── */}
      <path
        d={edgePath}
        fill="none"
        stroke={coreColor}
        strokeWidth={0.9}
        strokeOpacity={selected ? 0.95 : 0.6}
      />

      {/* ── Layer 4: Shimmer pulse (always-on subtle current) ───────────── */}
      <path
        d={edgePath}
        fill="none"
        stroke={baseColor}
        strokeWidth={1.5}
        strokeDasharray="10 44"
        strokeOpacity={0.65}
        style={{ animation: "fiber-shimmer 2.8s linear infinite" }}
      />

      {/* ── Layer 5: AI particle trails (active while AI generates) ─────── */}
      {isAIActive &&
        Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
          <circle key={i} r={2.5} fill={coreColor} filter={`url(#${ptclFilterId})`}>
            <animateMotion
              dur={`${1.4 + i * 0.4}s`}
              begin={`${-(i * (2.2 / PARTICLE_COUNT)).toFixed(2)}s`}
              repeatCount="indefinite"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        ))}

      {/* ── Endpoint dot ────────────────────────────────────────────────── */}
      <circle
        cx={targetX}
        cy={targetY}
        r={selected ? 3.5 : 2.5}
        fill={baseColor}
        opacity={0.85}
      />

      {/* ── Inline label (right-click to edit/delete) ────────────────────── */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          {label ? (
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                background: selected ? "rgba(74,158,255,0.18)" : "#0a1628",
                color: selected ? "#4A9EFF" : "#6b7a8d",
                padding: "2px 6px",
                border: `1px solid ${selected ? "#4A9EFF50" : "#1e3a5f"}`,
                borderRadius: 4,
                cursor: "context-menu",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              {label as string}
            </div>
          ) : (
            /* Invisible hit-area so right-click still works on unlabeled edges */
            <div style={{ width: 24, height: 12 }} />
          )}
        </div>
      </EdgeLabelRenderer>

      {/* Keyframes — duplicate definitions across edges are harmless */}
      <style>{`
        @keyframes fiber-shimmer {
          from { stroke-dashoffset: ${SHIMMER_CYCLE}; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
    </>
  );
}

export default CustomEdge;
