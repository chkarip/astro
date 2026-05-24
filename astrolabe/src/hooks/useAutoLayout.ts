import React from "react";
import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import dagre from "dagre";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const GOLDEN_NODE_SIZE = 120;
const CLUSTER_FALLBACK_W = 400;
const CLUSTER_FALLBACK_H = 300;

// Gap between orphan nodes when parked at the bottom-left
const ORPHAN_GAP = 24;
// How far below the connected-node bounding box orphans are placed
const ORPHAN_OFFSET_Y = 80;

const TIDY_TRANSITION = "transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
const TIDY_TRANSITION_DURATION = 500;

function clusterDims(node: { style?: React.CSSProperties }): { w: number; h: number } {
  const s = node.style ?? {};
  return {
    w: typeof s.width === "number" ? s.width : CLUSTER_FALLBACK_W,
    h: typeof s.height === "number" ? s.height : CLUSTER_FALLBACK_H,
  };
}

function nodeDims(node: { type?: string; style?: React.CSSProperties }): { w: number; h: number } {
  if (node.type === "cluster") return clusterDims(node);
  if (node.type === "golden") return { w: GOLDEN_NODE_SIZE, h: GOLDEN_NODE_SIZE };
  return { w: NODE_WIDTH, h: NODE_HEIGHT };
}

/**
 * Returns a `runLayout` function that, when called, re-computes positions
 * for all current nodes using a left-to-right dependency-tree algorithm:
 *
 *   • Root nodes (no incoming edges) → leftmost column
 *   • Each node appears to the right of whatever points to it
 *   • Orphan nodes (zero connections) → parked below the main graph
 *   • All position changes animate smoothly via CSS transitions
 */
export function useAutoLayout() {
  const { getNodes, getEdges, setNodes } = useReactFlow();

  const runLayout = useCallback((direction: "tree" | "horizontal" = "horizontal") => {
    const nodes = getNodes();
    const edges = getEdges();

    if (nodes.length === 0) return;

    // Only lay out top-level nodes; children of cluster groups keep their
    // relative positions and are not handed to Dagre.
    const topLevel = nodes.filter((n) => !n.parentId);
    const topLevelIds = new Set(topLevel.map((n) => n.id));

    // Edges whose both endpoints are top-level nodes
    const relevantEdges = edges.filter(
      (e) => topLevelIds.has(e.source) && topLevelIds.has(e.target)
    );
    const connectedIds = new Set<string>();
    relevantEdges.forEach((e) => {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    });

    // Orphans: top-level nodes with no edges at all
    const orphans = topLevel.filter((n) => !connectedIds.has(n.id));
    const connected = topLevel.filter((n) => connectedIds.has(n.id));

    // ── Dagre layout for connected nodes (left → right) ───────────────────
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: direction === "tree" ? "TB" : "LR",
      nodesep: direction === "tree" ? 80 : 60,
      ranksep: direction === "tree" ? 80 : 100,
      marginx: 60,
      marginy: 60,
    });

    connected.forEach((node) => {
      const { w, h } = nodeDims(node);
      g.setNode(node.id, { width: w, height: h });
    });

    relevantEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    // Compute the bounding box of all dagre-positioned nodes so orphans
    // can be placed cleanly below them.
    let maxY = 0;
    let minX = Infinity;
    connected.forEach((node) => {
      const dn = g.node(node.id);
      if (!dn) return;
      const { h } = nodeDims(node);
      const bottom = dn.y + h / 2;
      if (bottom > maxY) maxY = bottom;
      if (dn.x < minX) minX = dn.x;
    });
    if (!isFinite(minX)) minX = 60;

    // ── Place orphans in a top-to-bottom column at the bottom-left ────────
    const orphanPositions = new Map<string, { x: number; y: number }>();
    let orphanY = maxY + ORPHAN_OFFSET_Y;
    orphans.forEach((node) => {
      const { h } = nodeDims(node);
      orphanPositions.set(node.id, { x: minX, y: orphanY });
      orphanY += h + ORPHAN_GAP;
    });

    // ── Apply positions with a smooth CSS transition ──────────────────────
    setNodes((nds) =>
      nds.map((node) => {
        // Children of clusters keep their parent-relative positions
        if (node.parentId) return node;

        let newPosition: { x: number; y: number } | undefined;

        const dagreNode = g.node(node.id);
        if (dagreNode) {
          const { w, h } = nodeDims(node);
          newPosition = { x: dagreNode.x - w / 2, y: dagreNode.y - h / 2 };
        } else {
          newPosition = orphanPositions.get(node.id);
        }

        if (!newPosition) return node;

        return {
          ...node,
          position: newPosition,
          style: { ...(node.style ?? {}), transition: TIDY_TRANSITION },
        };
      })
    );

    // Strip the transition style after the animation finishes so dragging
    // stays instant.
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.parentId) return node;
          const { transition: _, ...rest } = (node.style ?? {}) as React.CSSProperties & { transition?: string };
          return { ...node, style: rest };
        })
      );
    }, TIDY_TRANSITION_DURATION);
  }, [getNodes, getEdges, setNodes]);

  return { runLayout };
}
