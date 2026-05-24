import { useEffect, useRef } from "react";

// ─── Deep Space Topography Background ────────────────────────────────────────
// Renders a canvas with slowly drifting radial-gradient nebulae in deep
// sapphire, navy, and charcoal tones, creating a sense of infinite depth.
// The React Flow dot grid sits on top, anchoring the space to a grid plane.

interface Blob {
  x: number;
  y: number;
  rx: number;     // horizontal radius
  ry: number;     // vertical radius
  vx: number;     // drift velocity x
  vy: number;     // drift velocity y
  phase: number;  // oscillation phase offset
  speed: number;  // oscillation speed
  color: [number, number, number]; // RGB
  alpha: number;  // base opacity
}

const DEEP_PALETTE: [number, number, number][] = [
  [10,  28,  60],   // deep sapphire
  [13,  27,  46],   // blueprint-bg navy
  [17,  34,  64],   // lighter navy
  [8,   14,  30],   // near-black charcoal-blue
  [20,  26,  50],   // slate-indigo
  [37,  99, 235],   // accent blue glow (low alpha)
  [12,  22,  42],   // midnight
];

function makeBlobField(w: number, h: number): Blob[] {
  const blobs: Blob[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const color = DEEP_PALETTE[i % DEEP_PALETTE.length];
    blobs.push({
      x: Math.random() * w,
      y: Math.random() * h,
      rx: w * (0.3 + Math.random() * 0.45),
      ry: h * (0.25 + Math.random() * 0.4),
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.08,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0003 + Math.random() * 0.0004,
      color,
      // accent glow blob gets a much lower base alpha
      alpha: color[2] > 200 ? 0.07 : 0.18 + Math.random() * 0.14,
    });
  }
  return blobs;
}

export function DeepSpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef<Blob[]>([]);
  const rafRef   = useRef<number>(0);
  const timeRef  = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Size the canvas to its CSS size ──────────────────────────────────────
    function resize() {
      const c = canvasRef.current;
      if (!c) return;
      const { width, height } = c.getBoundingClientRect();
      if (c.width !== width || c.height !== height) {
        c.width  = width;
        c.height = height;
        blobsRef.current = makeBlobField(width, height);
      }
    }

    resize();
    blobsRef.current = makeBlobField(canvas.width, canvas.height);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Render loop ───────────────────────────────────────────────────────────
    function draw(ts: number) {
      const c = canvasRef.current;
      const cx = c?.getContext("2d");
      if (!c || !cx) return;

      const dt = ts - timeRef.current;
      timeRef.current = ts;
      const { width, height } = c;

      // Base fill
      cx.fillStyle = "#0d1117";
      cx.fillRect(0, 0, width, height);

      const blobs = blobsRef.current;
      for (const b of blobs) {
        // Drift
        b.x += b.vx;
        b.y += b.vy;

        // Soft wrap-around with overscan so blobs don't pop
        const ovx = b.rx * 0.6;
        const ovy = b.ry * 0.6;
        if (b.x > width  + ovx) b.x = -ovx;
        if (b.x < -ovx)         b.x = width  + ovx;
        if (b.y > height + ovy) b.y = -ovy;
        if (b.y < -ovy)         b.y = height + ovy;

        // Breathe
        b.phase += b.speed * dt;
        const breathe = 0.85 + 0.15 * Math.sin(b.phase);
        const rx = b.rx * breathe;
        const ry = b.ry * breathe;
        const alpha = b.alpha * (0.88 + 0.12 * Math.sin(b.phase * 1.3));

        // Draw elliptical radial gradient
        cx.save();
        cx.translate(b.x, b.y);
        cx.scale(1, ry / rx);

        const grad = cx.createRadialGradient(0, 0, 0, 0, 0, rx);
        const [r, g, bl] = b.color;
        grad.addColorStop(0,   `rgba(${r},${g},${bl},${alpha})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${bl},${alpha * 0.45})`);
        grad.addColorStop(1,   `rgba(${r},${g},${bl},0)`);

        cx.fillStyle = grad;
        cx.beginPath();
        cx.arc(0, 0, rx, 0, Math.PI * 2);
        cx.fill();
        cx.restore();
      }

      // Subtle vignette — deepens the edges for infinite-depth feel
      const vignette = cx.createRadialGradient(
        width / 2, height / 2, height * 0.1,
        width / 2, height / 2, Math.max(width, height) * 0.85
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(4,8,18,0.72)");
      cx.fillStyle = vignette;
      cx.fillRect(0, 0, width, height);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
