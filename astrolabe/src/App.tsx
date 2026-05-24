import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";
import "@xyflow/react/dist/style.css";

import { IndexCardNode, GoldenNode, NoteNode, MilestoneNode, TaskNode } from "./components/nodes";
import { CustomEdge } from "./components/edges/CustomEdge";
import { AIActivityProvider } from "./context/AIActivityContext";
import { OrbitMenu } from "./components/OrbitMenu";
import { OraclePanel } from "./components/OraclePanel";
import { Observatory } from "./components/Observatory";
import { NodeToolbar, type SpawnableNodeType, isBlockType } from "./components/NodeToolbar";
import { CommandPalette } from "./components/CommandPalette";
import { DeepSpaceBackground } from "./components/DeepSpaceBackground";
import { ContextMenu } from "./components/ContextMenu";
import { useAutoLayout } from "./hooks/useAutoLayout";
import { useDatabase } from "./hooks/useDatabase";
import { nodeToRecord, migrateBrainstormBlocks } from "./utils/nodeSerializer";
import { taskMiniMapColor } from "./constants/status";
import type {
  AISuggestion,
  BuildPlan,
  IndexCardData,
  NodeStatus,
  OrbitMenuState,
  TaskData,
  TaskStatus,
  ChildBlock,
  ContextMenuState,
  LayoutMode,
} from "./types";

const nodeTypes: NodeTypes = {
  index_card: IndexCardNode as never,
  golden: GoldenNode as never,
  note: NoteNode as never,
  milestone: MilestoneNode as never,
  task: TaskNode as never,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge as never,
};

const GOLDEN_ID = "golden-oracle";

function newId() {
  return crypto.randomUUID();
}

function getMapContext(nodes: Node[], edges: Edge[]): string {
  const nodeLines = nodes.map((n) => {
    const d = n.data as unknown as { title?: string; description?: string; status?: string; childBlocks?: unknown[] };
    if (n.type === "task") {
      const parent = n.parentId ? nodes.find((p) => p.id === n.parentId) : null;
      const parentTitle = (parent?.data as { title?: string })?.title ?? "";
      const childCount = nodes.filter((c) => c.parentId === n.id && c.type === "task").length;
      const doneCount = nodes.filter((c) => c.parentId === n.id && c.type === "task" && (c.data as { status?: string }).status === "done").length;
      return `Task [${n.id}]: "${d.title ?? ""}" | status=${d.status ?? "pending"}${parent ? ` | child of "${parentTitle}"` : ""}${childCount > 0 ? ` | children: ${doneCount}/${childCount} done` : ""}`;
    }
    return `Node [${n.id}] (${n.type}): ${d.title ?? "(untitled)"} — ${d.description ?? ""}`;
  });
  const edgeLines = edges.map((e) => `Connection: ${e.source} → ${e.target}${e.label ? ` [${e.label}]` : ""}`);
  return [...nodeLines, ...edgeLines].join("\n");
}

// ─── HistorySnapshot — snapshot of nodes+edges for undo/redo ────────────────
// Defined at module level so it can be referenced by both AstrolabeCanvas
// and the applyHistorySnapshot callback without TypeScript scope issues.
export interface HistorySnapshot {
  nodes: Node[];
  edges: Edge[];
}

// ─── Inner canvas (needs ReactFlowProvider context via useAutoLayout) ─────────

interface CanvasProps {
  profileId: string;
  profileName: string;
  onBack: () => void;
}

function AstrolabeCanvas({ profileId, profileName, onBack }: CanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const { runLayout } = useAutoLayout();
  const db = useDatabase();

  const [orbitMenu, setOrbitMenu] = useState<OrbitMenuState>({
    visible: false,
    anchorNodeId: null,
    x: 0,
    y: 0,
    suggestions: [],
    loading: false,
  });

  const [oraclePanelOpen, setOraclePanelOpen] = useState(false);
  const toggleOracle = useCallback(() => setOraclePanelOpen((o) => !o), []);
  const [canvasMode, setCanvasMode] = useState<"select" | "hand">("select");
  const [loadingCanvas, setLoadingCanvas] = useState(true);
  const [equippedNodeType, setEquippedNodeType] = useState<SpawnableNodeType | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("tree");
  // Ref so callbacks can read current equipped type without stale closures
  const equippedRef = useRef<SpawnableNodeType | null>(null);
  equippedRef.current = equippedNodeType;
  const layoutModeRef = useRef<LayoutMode>("tree");
  layoutModeRef.current = layoutMode;
  // Tracks the last task node the user selected — used to route child block spawns
  const lastSelectedTaskIdRef = useRef<string | null>(null);

  // ── Node callbacks ────────────────────────────────────────────────────────
  const handleComplete = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, status: "done" } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      const d = node?.data as unknown as IndexCardData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "index_card",
        title: d?.title ?? "",
        body: d?.description ?? "",
        status: "done",
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
      db.logQuestEvent(id, "completed");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  const handleOrbit = useCallback(
    async (id: string, x: number, y: number) => {
      const allNodes = rfInstance?.getNodes() ?? [];
      const allEdges = rfInstance?.getEdges() ?? [];
      const node = allNodes.find((n) => n.id === id);
      const nodeData = node?.data as unknown as IndexCardData | undefined;
      const title = nodeData?.title ?? "";
      const description = nodeData?.description ?? "";

      setOrbitMenu({ visible: true, anchorNodeId: id, x, y, suggestions: [], loading: true });

      try {
        const ideas = await invoke<AISuggestion[]>("generate_node_ideas", {
          targetTitle: title,
          targetDesc: description,
          globalContext: getMapContext(allNodes, allEdges),
        });
        setOrbitMenu((prev) => ({ ...prev, suggestions: ideas, loading: false }));
      } catch {
        setOrbitMenu((prev) => ({ ...prev, suggestions: fallbackSuggestions(), loading: false }));
      }
    },
    [rfInstance]
  );

  const handleUncomplete = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, status: "pending" } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      const d = node?.data as unknown as IndexCardData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "index_card",
        title: d?.title ?? "",
        body: d?.description ?? "",
        status: "pending",
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  const handleStatusChange = useCallback(
    (id: string, status: NodeStatus) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, status } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      const d = node?.data as unknown as IndexCardData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "index_card",
        title: d?.title ?? "",
        body: d?.description ?? "",
        status,
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  const handleTitleCommit = useCallback(
    (id: string, title: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, title, isEditing: false } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      const d = node?.data as unknown as IndexCardData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "index_card",
        title,
        body: d?.description ?? "",
        status: d?.status ?? "pending",
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  const handleDescriptionCommit = useCallback(
    (id: string, description: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, description } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      const d = node?.data as unknown as IndexCardData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "index_card",
        title: d?.title ?? "",
        body: description,
        status: d?.status ?? "pending",
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  const handleTextCommit = useCallback(
    (id: string, text: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, text, isEditing: false } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "note",
        title: text,
        body: "",
        status: "pending",
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  const handleMilestoneLabelCommit = useCallback(
    (id: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label, isEditing: false } } : n
        )
      );
      const node = rfInstance?.getNodes().find((n) => n.id === id);
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "milestone",
        title: label,
        body: "",
        status: "pending",
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId]
  );

  // ── Build a React Flow node from scalar props ─────────────────────────────
  const makeCard = useCallback(
    (id: string, title: string, description: string, pos: { x: number; y: number }): Node => ({
      id,
      type: "index_card",
      position: pos,
      data: {
        title,
        description,
        status: "pending",
        onComplete: handleComplete,
        onUncomplete: handleUncomplete,
        onOrbit: handleOrbit,
        onStatusChange: handleStatusChange,
        onTitleCommit: handleTitleCommit,
        onDescriptionCommit: handleDescriptionCommit,
      } as unknown as Record<string, unknown>,
    }),
    [handleComplete, handleUncomplete, handleOrbit, handleStatusChange, handleTitleCommit, handleDescriptionCommit]
  );

  // ── Task node callbacks ───────────────────────────────────────────────────

  const handleTaskStatusChange = useCallback(
    (id: string, status: TaskStatus) => {
      setNodes((nds) => {
        const updated = nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, status } } : n
        );
        // If a child task changed, check whether all siblings are done → auto-mark parent
        const changedNode = updated.find((n) => n.id === id);
        if (changedNode?.parentId) {
          const siblings = updated.filter(
            (n) => n.parentId === changedNode.parentId && n.type === "task"
          );
          const allDone = siblings.length > 0 && siblings.every((n) => (n.data as TaskData).status === "done");
          if (allDone) {
            return updated.map((n) =>
              n.id === changedNode.parentId ? { ...n, data: { ...n.data, status: "done" as TaskStatus } } : n
            );
          }
        }
        return updated;
      });
      const node = nodesRef.current.find((n) => n.id === id);
      const d = node?.data as unknown as TaskData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "task",
        title: d?.title ?? "",
        body: JSON.stringify(d?.childBlocks ?? []),
        status: status as NodeStatus,
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId]
  );

  const handleTaskTitleCommit = useCallback(
    (id: string, title: string) => {
      setNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, title, isEditing: false } } : n)
      );
      const node = nodesRef.current.find((n) => n.id === id);
      const d = node?.data as unknown as TaskData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "task",
        title,
        body: JSON.stringify(d?.childBlocks ?? []),
        status: (d?.status ?? "pending") as NodeStatus,
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId]
  );

  const handleTaskBlocksChange = useCallback(
    (id: string, blocks: ChildBlock[]) => {
      setNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, childBlocks: blocks } } : n)
      );
      const node = nodesRef.current.find((n) => n.id === id);
      const d = node?.data as unknown as TaskData | undefined;
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "task",
        title: d?.title ?? "",
        body: JSON.stringify(blocks),
        status: (d?.status ?? "pending") as NodeStatus,
        position_x: node?.position.x ?? 0,
        position_y: node?.position.y ?? 0,
        parent_id: node?.parentId ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId]
  );

  const handleTaskToggleCollapse = useCallback(
    (id: string) => {
      setNodes((nds) => {
        const task = nds.find((n) => n.id === id);
        if (!task) return nds;
        const nowCollapsed = !(task.data as TaskData).collapsed;
        // Toggle the collapsed flag on the task node itself
        const updatedTask = nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, collapsed: nowCollapsed } } : n
        );
        // Hide / show direct children
        return updatedTask.map((n) => {
          if (n.parentId === id && n.type === "task") {
            return { ...n, hidden: nowCollapsed };
          }
          return n;
        });
      });
    },
    []
  );

  const handleTaskAddChildTask = useCallback(
    (parentId: string) => {
      const id = newId();
      const parent = nodesRef.current.find((n) => n.id === parentId);
      const parentData = parent?.data as unknown as TaskData | undefined;
      // Place child below parent with some offset
      const childCount = nodesRef.current.filter((n) => n.parentId === parentId).length;
      const pos = { x: 30, y: 70 + childCount * 70 };

      const newNode: Node = {
        id,
        type: "task",
        position: pos,
        parentId,
        extent: "parent" as const,
        data: {
          title: "",
          status: "pending" as TaskStatus,
          collapsed: false,
          childBlocks: [],
          isEditing: true,
          onStatusChange: handleTaskStatusChange,
          onTitleCommit: handleTaskTitleCommit,
          onBlocksChange: handleTaskBlocksChange,
          onToggleCollapse: handleTaskToggleCollapse,
          onAddChildTask: handleTaskAddChildTask,
        } as unknown as Record<string, unknown>,
      };

      pushHistory();
      setNodes((nds) => [...nds, newNode]);
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "task",
        title: "",
        body: "[]",
        status: "pending",
        position_x: pos.x,
        position_y: pos.y,
        parent_id: parentId,
      });

      // Expand parent if collapsed
      if (parentData?.collapsed) handleTaskToggleCollapse(parentId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId, handleTaskStatusChange, handleTaskTitleCommit, handleTaskBlocksChange, handleTaskToggleCollapse]
  );

  // ── Canvas state — starts empty, populated from DB ────────────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ── History (undo/redo) ───────────────────────────────────────────────────
  // HistorySnapshot is declared at module level (see above).
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);
  const nodeDeleteInProgressRef = useRef(false);

  const pushHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;
    const snap: HistorySnapshot = {
      nodes: nodesRef.current.map((n) => ({ ...n, data: { ...(n.data as object) } })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    };
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > 10) {
      historyRef.current = historyRef.current.slice(-10);
    }
    historyIndexRef.current = historyRef.current.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-attaches current callbacks to restored nodes (callbacks can't be cloned)
  const reattachCallbacks = useCallback(
    (snapshotNodes: Node[]): Node[] =>
      snapshotNodes.map((node) => {
        if (node.type === "golden") {
          return { ...node, deletable: false, data: { onToggleOracle: toggleOracle } as unknown as Record<string, unknown> };
        }
        if (node.type === "index_card") {
          return {
            ...node,
            data: {
              ...(node.data as object),
              onComplete: handleComplete,
              onUncomplete: handleUncomplete,
              onOrbit: handleOrbit,
              onStatusChange: handleStatusChange,
              onTitleCommit: handleTitleCommit,
              onDescriptionCommit: handleDescriptionCommit,
            } as unknown as Record<string, unknown>,
          };
        }
        if (node.type === "task") {
          return {
            ...node,
            data: {
              ...(node.data as object),
              onStatusChange: handleTaskStatusChange,
              onTitleCommit: handleTaskTitleCommit,
              onBlocksChange: handleTaskBlocksChange,
              onToggleCollapse: handleTaskToggleCollapse,
              onAddChildTask: handleTaskAddChildTask,
            } as unknown as Record<string, unknown>,
          };
        }
        if (node.type === "note") {
          return {
            ...node,
            data: { ...(node.data as object), onTextCommit: handleTextCommit } as unknown as Record<string, unknown>,
          };
        }
        if (node.type === "milestone") {
          return {
            ...node,
            data: { ...(node.data as object), onLabelCommit: handleMilestoneLabelCommit } as unknown as Record<string, unknown>,
          };
        }
        return node;
      }),
    [toggleOracle, handleComplete, handleUncomplete, handleOrbit, handleStatusChange, handleTitleCommit, handleDescriptionCommit, handleTaskStatusChange, handleTaskTitleCommit, handleTaskBlocksChange, handleTaskToggleCollapse, handleTaskAddChildTask, handleTextCommit, handleMilestoneLabelCommit]
  );

  // Apply a history snapshot: restore React state + sync DB diff
  const applyHistorySnapshot = useCallback(
    async (snap: HistorySnapshot) => {
      const prevNodes = nodesRef.current;
      const prevEdges = edgesRef.current;
      const prevNodeIds = new Set(prevNodes.map((n) => n.id));
      const newNodeIds = new Set(snap.nodes.map((n) => n.id));
      const prevEdgeIds = new Set(prevEdges.map((e) => e.id));
      const newEdgeIds = new Set(snap.edges.map((e) => e.id));

      // Nodes removed by this undo/redo → delete from DB
      for (const node of prevNodes) {
        if (!newNodeIds.has(node.id)) await db.deleteNode(node.id);
      }
      // Nodes added back by this undo/redo → upsert to DB
      for (const node of snap.nodes) {
        if (!prevNodeIds.has(node.id)) await db.upsertNode(nodeToRecord(node, profileId));
      }
      // Edges removed → delete from DB
      for (const edge of prevEdges) {
        if (!newEdgeIds.has(edge.id)) await db.deleteEdge(edge.id);
      }
      // Edges added back → upsert to DB
      for (const edge of snap.edges) {
        if (!prevEdgeIds.has(edge.id)) {
          await db.upsertEdge({
            id: edge.id,
            profile_id: profileId,
            source_id: edge.source,
            target_id: edge.target,
            label: (edge.label as string) ?? "",
          });
        }
      }

      isUndoRedoRef.current = true;
      setNodes(reattachCallbacks(snap.nodes));
      setEdges(snap.edges);
      isUndoRedoRef.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId, reattachCallbacks, setNodes, setEdges]
  );

  // Wrapped onNodesChange: protect golden node, sync deletes to DB, push history
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removes = changes.filter((c) => c.type === "remove");
      const others = changes.filter((c) => c.type !== "remove");
      const validRemoves = removes.filter((c) => (c as { id: string }).id !== GOLDEN_ID);

      if (validRemoves.length > 0) {
        pushHistory();
        nodeDeleteInProgressRef.current = true;
        validRemoves.forEach((c) => db.deleteNode((c as { id: string }).id));
        // Reset flag after React processes cascaded edge removes
        setTimeout(() => { nodeDeleteInProgressRef.current = false; }, 0);
      }

      onNodesChange([...others, ...validRemoves] as NodeChange[]);
    },
    [onNodesChange, pushHistory, db]
  );

  // Wrapped onEdgesChange: sync deletes to DB; push history for standalone edge deletes
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removes = changes.filter((c) => c.type === "remove");
      if (removes.length > 0 && !nodeDeleteInProgressRef.current) {
        // Standalone edge deletion (user manually deleted an edge)
        pushHistory();
        removes.forEach((c) => db.deleteEdge((c as { id: string }).id));
      } else if (removes.length > 0) {
        // Cascade from node deletion — just sync DB, history already pushed
        removes.forEach((c) => db.deleteEdge((c as { id: string }).id));
      }
      onEdgesChange(changes);
    },
    [onEdgesChange, pushHistory, db]
  );

  // ── Find nearest task node to a canvas position ──────────────────────────
  const findNearestTaskId = useCallback(
    (pos: { x: number; y: number }): string | null => {
      const tasks = nodesRef.current.filter((n) => n.type === "task");
      if (tasks.length === 0) return null;
      let best: Node | null = null;
      let minDist = Infinity;
      for (const t of tasks) {
        const d = Math.hypot(t.position.x - pos.x, t.position.y - pos.y);
        if (d < minDist) { minDist = d; best = t; }
      }
      return best?.id ?? null;
    },
    []
  );

  // ── Spawn any node type at a canvas position ──────────────────────────────
  const spawnNodeAt = useCallback(
    (type: SpawnableNodeType, pos: { x: number; y: number }) => {
      // ── Child block types — attach to nearest/last-selected task ──────────
      if (isBlockType(type)) {
        const taskId = lastSelectedTaskIdRef.current ?? findNearestTaskId(pos);
        if (!taskId) return; // no task to attach to
        const task = nodesRef.current.find((n) => n.id === taskId);
        if (!task) return;
        const taskData = task.data as unknown as TaskData;
        const blockId = newId();
        let newBlock: ChildBlock;
        if (type === "description") {
          newBlock = { type: "description", id: blockId, content: "" };
        } else if (type === "steps") {
          newBlock = { type: "steps", id: blockId, items: [] };
        } else {
          newBlock = { type: "brainstorm", id: blockId, bullets: [] };
        }
        const updatedBlocks = [...(taskData.childBlocks ?? []), newBlock];
        handleTaskBlocksChange(taskId, updatedBlocks);
        return;
      }

      // ── Canvas node types ─────────────────────────────────────────────────
      const id = newId();
      let newNode: Node;

      if (type === "index_card") {
        newNode = {
          ...makeCard(id, "", "", pos),
          data: {
            ...makeCard(id, "", "", pos).data,
            isEditing: true,
          } as unknown as Record<string, unknown>,
        };
        db.upsertNode({
          id, profile_id: profileId, node_type: "index_card",
          title: "", body: "", status: "pending",
          position_x: pos.x, position_y: pos.y, parent_id: null,
        });
      } else if (type === "note") {
        newNode = {
          id, type: "note", position: pos,
          data: {
            text: "", isEditing: true,
            onTextCommit: handleTextCommit,
          } as unknown as Record<string, unknown>,
        };
        db.upsertNode({
          id, profile_id: profileId, node_type: "note",
          title: "", body: "", status: "pending",
          position_x: pos.x, position_y: pos.y, parent_id: null,
        });
      } else if (type === "milestone") {
        newNode = {
          id, type: "milestone", position: pos,
          data: {
            label: "",
            isEditing: true,
            onLabelCommit: handleMilestoneLabelCommit,
          } as unknown as Record<string, unknown>,
        };
        db.upsertNode({
          id, profile_id: profileId, node_type: "milestone",
          title: "", body: "", status: "pending",
          position_x: pos.x, position_y: pos.y, parent_id: null,
        });
      } else {
        return; // exhaustiveness guard
      }

      pushHistory();
      setNodes((nds) => [...nds, newNode]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [makeCard, handleTextCommit, handleMilestoneLabelCommit, handleTaskBlocksChange, findNearestTaskId, setNodes, profileId, pushHistory]
  );

  // ── Load this profile's canvas from the database ──────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadCanvas() {
      setLoadingCanvas(true);
      const [dbNodes, dbEdges] = await Promise.all([
        db.getAllNodes(profileId),
        db.getAllEdges(profileId),
      ]);
      if (cancelled) return;

      if (dbNodes.length === 0) {
        // Fresh profile — seed with golden Oracle node only
        const goldenNode: Node = {
          id: GOLDEN_ID,
          type: "golden",
          position: { x: 400, y: 280 },
          deletable: false,
          data: { onToggleOracle: toggleOracle } as unknown as Record<string, unknown>,
        };
        setNodes([goldenNode]);
        db.upsertNode({
          id: GOLDEN_ID,
          profile_id: profileId,
          node_type: "golden",
          title: "Oracle",
          body: "",
          status: "pending",
          position_x: 400,
          position_y: 280,
          parent_id: null,
        });
      } else {
        const existingIds = new Set(dbNodes.map((r) => r.id));

        const flowNodes: Node[] = dbNodes.map((r) => {
          if (r.node_type === "golden") {
            return {
              id: r.id,
              type: "golden",
              position: { x: r.position_x, y: r.position_y },
              deletable: false,
              data: { onToggleOracle: toggleOracle } as unknown as Record<string, unknown>,
            };
          }
          if (r.node_type === "task") {
            let childBlocks: ChildBlock[] = [];
            try { childBlocks = JSON.parse(r.body) as ChildBlock[]; } catch { /* empty */ }
            // Migrate legacy brainstorm bullets (string[] → BrainstormBullet[])
            childBlocks = migrateBrainstormBlocks(childBlocks);
            const parentId = r.parent_id && existingIds.has(r.parent_id) ? r.parent_id : undefined;
            return {
              id: r.id,
              type: "task",
              position: { x: r.position_x, y: r.position_y },
              ...(parentId ? { parentId, extent: "parent" as const } : {}),
              data: {
                title: r.title,
                status: (r.status as TaskStatus) ?? "pending",
                collapsed: false,
                childBlocks,
                onStatusChange: handleTaskStatusChange,
                onTitleCommit: handleTaskTitleCommit,
                onBlocksChange: handleTaskBlocksChange,
                onToggleCollapse: handleTaskToggleCollapse,
                onAddChildTask: handleTaskAddChildTask,
              } as unknown as Record<string, unknown>,
            };
          }
          if (r.node_type === "note") {
            return {
              id: r.id,
              type: "note",
              position: { x: r.position_x, y: r.position_y },
              data: {
                text: r.title,
                onTextCommit: handleTextCommit,
              } as unknown as Record<string, unknown>,
            };
          }
          if (r.node_type === "milestone") {
            return {
              id: r.id,
              type: "milestone",
              position: { x: r.position_x, y: r.position_y },
              data: { label: r.title, onLabelCommit: handleMilestoneLabelCommit } as unknown as Record<string, unknown>,
            };
          }
          const parentId = r.parent_id && existingIds.has(r.parent_id) ? r.parent_id : undefined;
          const card = makeCard(r.id, r.title, r.body, { x: r.position_x, y: r.position_y });
          return {
            ...card,
            ...(parentId ? { parentId } : {}),
            data: { ...card.data, status: r.status as NodeStatus },
          };
        });

        const flowEdges: Edge[] = dbEdges.map((r) => ({
          id: r.id,
          source: r.source_id,
          target: r.target_id,
          type: "custom",
          label: r.label,
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
      }
      setLoadingCanvas(false);
    }

    loadCanvas();
    return () => { cancelled = true; };
    // Component is keyed by profileId in App — runs only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-run tree layout once the canvas finishes loading
  useEffect(() => {
    if (loadingCanvas) return;
    setTimeout(() => runLayout("tree"), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCanvas]);

  // ── React Flow callbacks ──────────────────────────────────────────────────
  const onConnect: OnConnect = useCallback(
    (connection) => {
      pushHistory();
      const edge: Edge = { ...connection, id: newId(), type: "custom" };
      // Use manual dedup instead of addEdge so multiple connections from the
      // same handle to different targets are always allowed.
      setEdges((eds) => {
        const isDup = eds.some(
          (e) =>
            e.source === edge.source &&
            e.target === edge.target &&
            e.sourceHandle === edge.sourceHandle &&
            e.targetHandle === edge.targetHandle,
        );
        return isDup ? eds : [...eds, edge];
      });
      db.upsertEdge({
        id: edge.id,
        profile_id: profileId,
        source_id: edge.source!,
        target_id: edge.target!,
        label: "",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setEdges, profileId, pushHistory]
  );

  const addNodeFromSuggestion = useCallback(
    (suggestion: AISuggestion, position?: { x: number; y: number }) => {
      const id = newId();
      const anchorId = orbitMenu.anchorNodeId;
      const pos = position ?? { x: 300, y: 400 };

      const newNode: Node = {
        id,
        type: "index_card",
        position: pos,
        data: {
          title: suggestion.title,
          description: suggestion.description,
          status: "pending",
          onComplete: handleComplete,
          onUncomplete: handleUncomplete,
          onOrbit: handleOrbit,
          onStatusChange: handleStatusChange,
          onTitleCommit: handleTitleCommit,
          onDescriptionCommit: handleDescriptionCommit,
        } as unknown as Record<string, unknown>,
      };

      pushHistory();
      setNodes((nds) => [...nds, newNode]);
      db.upsertNode({
        id,
        profile_id: profileId,
        node_type: "index_card",
        title: suggestion.title,
        body: suggestion.description,
        status: "pending",
        position_x: pos.x,
        position_y: pos.y,
        parent_id: anchorId,
      });

      if (anchorId) {
        const eid = newId();
        const edge: Edge = { id: eid, source: anchorId, target: id, type: "custom" };
        setEdges((eds) => addEdge(edge, eds));
        db.upsertEdge({
          id: eid,
          profile_id: profileId,
          source_id: anchorId,
          target_id: id,
          label: "",
        });
      }

      setOrbitMenu((prev) => ({ ...prev, visible: false }));
      setTimeout(runLayout, 80);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orbitMenu.anchorNodeId, handleComplete, handleUncomplete, handleOrbit, handleTitleCommit, handleDescriptionCommit, setNodes, setEdges, profileId, runLayout, pushHistory]
  );

  // ── Build Mode handler ────────────────────────────────────────────────────
  const handleBuild = useCallback(
    (plan: BuildPlan) => {
      if (!rfInstance) return;

      // Position new nodes in a grid anchored to the viewport centre
      const vp = rfInstance.getViewport();
      const cx = (window.innerWidth / 2 - vp.x) / vp.zoom;
      const cy = (window.innerHeight / 2 - vp.y) / vp.zoom;

      const COLS = 3;
      const COL_W = 280;
      const ROW_H = 160;
      const totalW = Math.min(plan.nodes.length, COLS) * COL_W;
      const startX = cx - totalW / 2;
      const startY = cy - ROW_H;

      // Map temp AI ids → real UUIDs
      const idMap = new Map<string, string>();
      plan.nodes.forEach((n) => {
        idMap.set(n.id, newId());
      });

      const newNodes: Node[] = plan.nodes.map((n, i) => {
        const realId = idMap.get(n.id)!;
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const pos = { x: startX + col * COL_W, y: startY + row * ROW_H };

        if (n.node_type === "note") {
          db.upsertNode({
            id: realId, profile_id: profileId, node_type: "note",
            title: n.title, body: "", status: "pending",
            position_x: pos.x, position_y: pos.y, parent_id: null,
          });
          return {
            id: realId, type: "note", position: pos,
            data: { text: n.title, onTextCommit: handleTextCommit } as unknown as Record<string, unknown>,
          };
        }
        if (n.node_type === "milestone") {
          db.upsertNode({
            id: realId, profile_id: profileId, node_type: "milestone",
            title: n.title, body: "", status: "pending",
            position_x: pos.x, position_y: pos.y, parent_id: null,
          });
          return {
            id: realId, type: "milestone", position: pos,
            data: { label: n.title } as unknown as Record<string, unknown>,
          };
        }
        // default: index_card
        db.upsertNode({
          id: realId, profile_id: profileId, node_type: "index_card",
          title: n.title, body: n.description, status: "pending",
          position_x: pos.x, position_y: pos.y, parent_id: null,
        });
        return makeCard(realId, n.title, n.description, pos);
      });

      const newEdges: Edge[] = plan.edges.flatMap((e) => {
        // Resolve source/target — may be a temp AI id or an existing canvas id
        const src = idMap.get(e.source) ?? e.source;
        const tgt = idMap.get(e.target) ?? e.target;
        const eid = newId();
        db.upsertEdge({ id: eid, profile_id: profileId, source_id: src, target_id: tgt, label: e.label ?? "" });
        return [{ id: eid, source: src, target: tgt, type: "custom", label: e.label ?? "" }];
      });

      pushHistory();
      setNodes((nds) => [...nds, ...newNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
      setTimeout(runLayout, 120);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, profileId, makeCard, handleTextCommit, setNodes, setEdges, runLayout, pushHistory]
  );

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Skip if a node type is equipped — single click handles spawning
      if (equippedRef.current) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains("react-flow__pane")) return;
      if (!rfInstance) return;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const pos = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const id = newId();
      pushHistory();
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "task",
          position: pos,
          data: {
            title: "",
            status: "pending" as TaskStatus,
            collapsed: false,
            childBlocks: [],
            isEditing: true,
            onStatusChange: handleTaskStatusChange,
            onTitleCommit: handleTaskTitleCommit,
            onBlocksChange: handleTaskBlocksChange,
            onToggleCollapse: handleTaskToggleCollapse,
            onAddChildTask: handleTaskAddChildTask,
          } as unknown as Record<string, unknown>,
        },
      ]);
      db.upsertNode({
        id, profile_id: profileId, node_type: "task",
        title: "", body: "[]", status: "pending",
        position_x: pos.x, position_y: pos.y, parent_id: null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, setNodes, profileId, pushHistory, handleTaskStatusChange, handleTaskTitleCommit, handleTaskBlocksChange, handleTaskToggleCollapse, handleTaskAddChildTask]
  );

  // Single-click on pane — spawn equipped node type
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      const equipped = equippedRef.current;
      if (!equipped) return;
      // Ignore the second click of a double-click
      if (event.detail !== 1) return;
      if (!rfInstance) return;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const pos = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      spawnNodeAt(equipped, pos);
      setEquippedNodeType(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfInstance, spawnNodeAt]
  );

  // Click on a node while a block type is equipped — attach block to that task
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const equipped = equippedRef.current;
      if (!equipped || !isBlockType(equipped)) return;
      if (node.type !== "task") return;
      const taskData = node.data as unknown as TaskData;
      const blockId = newId();
      let newBlock: ChildBlock;
      if (equipped === "description") {
        newBlock = { type: "description", id: blockId, content: "" };
      } else if (equipped === "steps") {
        newBlock = { type: "steps", id: blockId, items: [{ id: newId(), text: "", done: false }] };
      } else {
        newBlock = { type: "brainstorm", id: blockId, bullets: [{ id: newId(), text: "" }] };
      }
      handleTaskBlocksChange(node.id, [...(taskData.childBlocks ?? []), newBlock]);
      setEquippedNodeType(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleTaskBlocksChange]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const selectedTask = selectedNodes.find((n) => n.type === "task");
      if (selectedTask) lastSelectedTaskIdRef.current = selectedTask.id;
    },
    []
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!rfInstance) return;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const pos = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      // Handle AI suggestion drops
      const raw = event.dataTransfer.getData("application/astrolabe-suggestion");
      if (raw) {
        const suggestion: AISuggestion = JSON.parse(raw);
        addNodeFromSuggestion(suggestion, pos);
        return;
      }

      // Handle block-type drags from the toolbar
      const blockType = event.dataTransfer.getData("application/astrolabe-block-type");
      if (blockType && isBlockType(blockType as SpawnableNodeType)) {
        spawnNodeAt(blockType as SpawnableNodeType, pos);
      }
    },
    [rfInstance, addNodeFromSuggestion, spawnNodeAt]
  );

  const orbitDragStart = useCallback((e: React.DragEvent, suggestion: AISuggestion) => {
    e.dataTransfer.setData("application/astrolabe-suggestion", JSON.stringify(suggestion));
    e.dataTransfer.effectAllowed = "move";
    setOrbitMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  // ── Proximity nesting: drag a task near another to snap it as a child ────
  const SNAP_DISTANCE = 90;

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      if (draggedNode.type !== "task") return;

      const allNodes = nodesRef.current;
      // Find nearest task that could become a parent (must be top-level)
      const candidates = allNodes.filter(
        (n) => n.type === "task" && n.id !== draggedNode.id && !n.parentId
      );

      let closest: Node | null = null;
      let minDist = Infinity;
      for (const candidate of candidates) {
        // Use absolute position (draggedNode already has parentId-relative position if it has a parent)
        const dragAbs = draggedNode.parentId
          ? {
            x: (allNodes.find((n) => n.id === draggedNode.parentId)?.position.x ?? 0) + draggedNode.position.x,
            y: (allNodes.find((n) => n.id === draggedNode.parentId)?.position.y ?? 0) + draggedNode.position.y,
          }
          : draggedNode.position;
        const dist = Math.hypot(dragAbs.x - candidate.position.x, dragAbs.y - candidate.position.y);
        if (dist < SNAP_DISTANCE && dist < minDist) {
          minDist = dist;
          closest = candidate;
        }
      }

      if (closest && !draggedNode.parentId) {
        // Snap dragged node as child of closest
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== draggedNode.id) return n;
            const parent = nds.find((p) => p.id === closest!.id);
            return {
              ...n,
              parentId: closest!.id,
              extent: "parent" as const,
              position: {
                x: Math.max(10, draggedNode.position.x - (parent?.position.x ?? 0)),
                y: Math.max(10, draggedNode.position.y - (parent?.position.y ?? 0)),
              },
            };
          })
        );
        db.upsertNode({
          id: draggedNode.id,
          profile_id: profileId,
          node_type: "task",
          title: (draggedNode.data as TaskData).title ?? "",
          body: JSON.stringify((draggedNode.data as TaskData).childBlocks ?? []),
          status: ((draggedNode.data as TaskData).status ?? "pending") as NodeStatus,
          position_x: draggedNode.position.x,
          position_y: draggedNode.position.y,
          parent_id: closest.id,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId, setNodes]
  );

  // ── Context menu handlers ─────────────────────────────────────────────────
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (node.type !== "task") return; // only task nodes get context menu
      setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    []
  );

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        type: "edge",
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
        currentLabel: (edge.label as string) ?? "",
      });
    },
    []
  );

  const handleContextMenuSetNodeStatus = useCallback(
    (nodeId: string, status: TaskStatus) => {
      handleTaskStatusChange(nodeId, status);
    },
    [handleTaskStatusChange]
  );

  const handleContextMenuDeleteNode = useCallback(
    (nodeId: string) => {
      pushHistory();
      db.deleteNode(nodeId);
      // Also delete child nodes
      const childIds = nodesRef.current
        .filter((n) => n.parentId === nodeId)
        .map((n) => n.id);
      childIds.forEach((cid) => db.deleteNode(cid));
      setNodes((nds) => nds.filter((n) => n.id !== nodeId && n.parentId !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushHistory, setNodes, setEdges]
  );

  const handleContextMenuSetEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      pushHistory();
      setEdges((eds) =>
        eds.map((e) => e.id === edgeId ? { ...e, label } : e)
      );
      const edge = edgesRef.current.find((e) => e.id === edgeId);
      if (edge) {
        db.upsertEdge({
          id: edgeId,
          profile_id: profileId,
          source_id: edge.source,
          target_id: edge.target,
          label,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId, pushHistory, setEdges]
  );

  const handleContextMenuDeleteEdge = useCallback(
    (edgeId: string) => {
      pushHistory();
      db.deleteEdge(edgeId);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushHistory, setEdges]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Delete / Backspace — remove selected nodes (except golden) and edges
      if (e.key === "Delete" || e.key === "Backspace") {
        const selectedNodes = nodesRef.current.filter((n) => n.selected && n.id !== GOLDEN_ID);
        const selectedEdges = edgesRef.current.filter((edge) => edge.selected);
        if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
        e.preventDefault();
        pushHistory();
        const removedNodeIds = new Set(selectedNodes.map((n) => n.id));
        selectedNodes.forEach((n) => db.deleteNode(n.id));
        // Also delete edges connected to deleted nodes
        const connectedEdges = edgesRef.current.filter(
          (edge) => removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)
        );
        const allEdgesToDelete = new Set([
          ...selectedEdges.map((edge) => edge.id),
          ...connectedEdges.map((edge) => edge.id),
        ]);
        allEdgesToDelete.forEach((edgeId) => db.deleteEdge(edgeId));
        setNodes((nds) => nds.filter((n) => !removedNodeIds.has(n.id)));
        setEdges((eds) => eds.filter((edge) => !allEdgesToDelete.has(edge.id)));
        return;
      }

      // Undo / Redo
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          // Redo
          const nextIndex = historyIndexRef.current + 1;
          if (nextIndex < historyRef.current.length) {
            historyIndexRef.current = nextIndex;
            applyHistorySnapshot(historyRef.current[nextIndex]);
          }
        } else {
          // Undo
          if (historyIndexRef.current > 0) {
            historyIndexRef.current -= 1;
            applyHistorySnapshot(historyRef.current[historyIndexRef.current]);
          }
        }
        return;
      }

      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
      if (e.key.toLowerCase() === "s") setCanvasMode("select");
      if (e.key.toLowerCase() === "h") setCanvasMode("hand");
      if (e.key === "Escape") {
        setEquippedNodeType(null);
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [applyHistorySnapshot, pushHistory, setNodes, setEdges, db]);

  if (loadingCanvas) {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1117",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "#495670",
        letterSpacing: "0.1em",
      }}>
        Loading profile…
      </div>
    );
  }

  const isAIActive = orbitMenu.loading;

  return (
    <AIActivityProvider isAIActive={isAIActive}>
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <DeepSpaceBackground />
      <div
        ref={reactFlowWrapper}
        className="w-full h-full"
        style={{ position: "relative", zIndex: 1 }}
        onDoubleClick={onPaneDoubleClick}
      >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onInit={(instance) => { setRfInstance(instance); rfInstanceRef.current = instance; }}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        fitView
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        defaultEdgeOptions={{ type: "custom" }}
        proOptions={{ hideAttribution: true }}
        panOnDrag={canvasMode === "hand" ? true : [1, 2]}
        selectionOnDrag={canvasMode === "select"}
        style={{
          background: "transparent",
          cursor: equippedNodeType
            ? "crosshair"
            : canvasMode === "hand"
            ? "grab"
            : "default",
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="rgba(30,58,95,0.35)" />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            if (node.type === "golden") return "#f5a623";
            if (node.type === "task") {
              const td = node.data as unknown as TaskData;
              return taskMiniMapColor(td?.status);
            }
            const d = node.data as unknown as IndexCardData;
            return d?.status === "done" ? "#4ade80" : "#2563eb";
          }}
          maskColor="rgba(13,27,46,0.7)"
        />

        {/* ── Back to Observatory + profile name ── */}
        <Panel position="top-left">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={onBack}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "6px 12px",
                background: "rgba(13,27,46,0.85)",
                border: "1px solid #1e3a5f",
                borderRadius: 4,
                color: "#8892b0",
                cursor: "pointer",
                transition: "all 0.15s",
                backdropFilter: "blur(4px)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#f5a623";
                e.currentTarget.style.color = "#f5a623";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#1e3a5f";
                e.currentTarget.style.color = "#8892b0";
              }}
            >
              ← Observatory
            </button>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#495670",
              letterSpacing: "0.12em",
              padding: "3px 2px",
            }}>
              {profileName}
            </div>
          </div>
        </Panel>

      </ReactFlow>

      <OrbitMenu
        visible={orbitMenu.visible}
        x={orbitMenu.x}
        y={orbitMenu.y}
        suggestions={orbitMenu.suggestions}
        loading={orbitMenu.loading}
        onSelect={addNodeFromSuggestion}
        onClose={() => setOrbitMenu((prev) => ({ ...prev, visible: false }))}
        onDragStart={orbitDragStart}
      />

      <OraclePanel open={oraclePanelOpen} onClose={() => setOraclePanelOpen(false)} onBuild={handleBuild} profileId={profileId} />

      {/* ── Command Palette (Q key) ── */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSpawn={(type) => {
          if (!rfInstance) return;
          const vp = rfInstance.getViewport();
          // Spawn at viewport centre
          const cx = (window.innerWidth / 2 - vp.x) / vp.zoom;
          const cy = (window.innerHeight / 2 - vp.y) / vp.zoom;
          spawnNodeAt(type, { x: cx, y: cy });
        }}
      />

      {/* ── Node Toolbar ── */}
      <NodeToolbar
        equipped={equippedNodeType}
        onEquip={setEquippedNodeType}
        onTidy={() => runLayout(layoutModeRef.current)}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
      />

      {/* ── Context Menu ── */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onSetNodeStatus={handleContextMenuSetNodeStatus}
        onAddChildTask={(nodeId) => { handleTaskAddChildTask(nodeId); }}
        onDeleteNode={handleContextMenuDeleteNode}
        onSetEdgeLabel={handleContextMenuSetEdgeLabel}
        onDeleteEdge={handleContextMenuDeleteEdge}
      />

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            color: "#495670",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            background: "rgba(13,27,46,0.7)",
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid #1e3a5f",
          }}
        >
          double-click canvas → task · right-click task → menu · drag near task → nest · Q → palette
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "4px 10px",
            borderRadius: 4,
            background: canvasMode === "select" ? "rgba(37,99,235,0.15)" : "rgba(245,166,35,0.12)",
            border: `1.5px solid ${canvasMode === "select" ? "#2563eb" : "#f5a623"}`,
            color: canvasMode === "select" ? "#7aa2f7" : "#f5a623",
          }}
        >
          {canvasMode === "select" ? "S SELECT" : "H HAND"}
        </div>
      </div>
    </div>
    </div>
    </AIActivityProvider>
  );
}

function fallbackSuggestions(): AISuggestion[] {
  return [
    { title: "Define your vision", description: "" },
    { title: "Identify key milestones", description: "" },
    { title: "Map out obstacles", description: "" },
    { title: "Set your first step", description: "" },
  ];
}

// ─── Root App — manages which profile is active ───────────────────────────────

export default function App() {
  const [activeProfile, setActiveProfile] = useState<{ id: string; name: string } | null>(null);

  if (!activeProfile) {
    return (
      <Observatory
        onEnterProfile={(id, name) => setActiveProfile({ id, name })}
      />
    );
  }

  return (
    <ReactFlowProvider>
      <div className="w-screen h-screen overflow-hidden relative">
        {/* key forces full remount on profile switch — guarantees zero canvas bleed */}
        <AstrolabeCanvas
          key={activeProfile.id}
          profileId={activeProfile.id}
          profileName={activeProfile.name}
          onBack={() => setActiveProfile(null)}
        />
      </div>
    </ReactFlowProvider>
  );
}

