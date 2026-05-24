import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import type { GoldenNodeData } from "../../types";

/** Animated SVG hexagon shape */
function Hexagon({ size = 120 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0"
    >
      <defs>
        <radialGradient id="golden-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="60%" stopColor="#f5a623" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <filter id="golden-glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polygon
        points={points}
        fill="url(#golden-grad)"
        stroke="#f5a623"
        strokeWidth="2"
        filter="url(#golden-glow)"
      />
    </svg>
  );
}

export function GoldenNode({ data }: NodeProps) {
  const { onToggleOracle } = data as unknown as GoldenNodeData;
  const size = 120;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer pulsing glow ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: -16,
          background: "radial-gradient(circle, rgba(245,166,35,0.25) 0%, transparent 70%)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Second ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: -8,
          border: "1px solid rgba(245,166,35,0.4)",
          borderRadius: "50%",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />

      {/* Clickable hexagon — toggles Astro chat panel */}
      <motion.div
        className="relative cursor-pointer"
        style={{ width: size, height: size }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        onClick={onToggleOracle}
      >
        <Hexagon size={size} />

        {/* Center label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ pointerEvents: "none" }}
        >
          <span
            className="text-xs font-bold tracking-widest"
            style={{ color: "#0d1b2e", fontFamily: "var(--font-mono)" }}
          >
            ✦ ASTRO
          </span>
        </div>
      </motion.div>

      {/* React Flow handles — invisible but functional */}
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Left} id="left" style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Top} id="top" style={{ opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}

export default GoldenNode;
