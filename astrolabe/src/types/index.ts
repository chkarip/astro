/**
 * @file Shared TypeScript types for Astrolabe.
 *
 * Naming conventions used throughout:
 *  - `NodeStatus`   — statuses for IndexCard nodes  ("in_progress" with underscore)
 *  - `TaskStatus`   — statuses for Task nodes        ("inprogress" without underscore)
 *  Both exist because IndexCard and Task nodes have separate status cycles and
 *  visual configs.  Both are persisted as raw strings in the SQLite `nodes.status`
 *  column (typed as `string` in NodeRecord so either value is valid).
 *
 * React Flow note:
 *  React Flow requires node `data` to extend `Record<string, unknown>`.  As a
 *  result every node-data interface stores event-handler callbacks alongside its
 *  serialisable fields.  Handlers are re-attached after undo/redo via
 *  `reattachCallbacks` in App.tsx and must NEVER be serialised to the database.
 */

// ─── Status types ─────────────────────────────────────────────────────────────

/**
 * Lifecycle status for IndexCard nodes.
 * Uses snake_case to match legacy data already stored in SQLite.
 */
export type NodeStatus = "pending" | "in_progress" | "done" | "blocked";

/**
 * Lifecycle status for Task / child-task nodes.
 * Uses camelCase to distinguish it from NodeStatus at the type level.
 */
export type TaskStatus = "pending" | "inprogress" | "done" | "blocked";

/** Canvas node types.  "golden" is the singleton Oracle node. */
export type NodeType = "index_card" | "golden" | "note" | "milestone" | "task";

/** Direction used by the auto-layout algorithm. */
export type LayoutMode = "tree" | "horizontal";

// ─── Task child-block types ───────────────────────────────────────────────────

/** A free-text description block inside a TaskNode. */
export interface DescriptionBlock {
  type: "description";
  id: string;
  content: string;
}

/** A step in a StepsBlock.  `done` drives the strikethrough and checkbox state. */
export interface StepItem {
  id: string;
  text: string;
  done: boolean;
}

/** An ordered checklist block inside a TaskNode. */
export interface StepsBlock {
  type: "steps";
  id: string;
  items: StepItem[];
}

/**
 * A single bullet in a BrainstormBlock.
 * Stored as an object (not a plain string) so that React can use `id` as a
 * stable key — avoids reconciliation bugs when bullets are deleted mid-list.
 */
export interface BrainstormBullet {
  id: string;
  text: string;
}

/** An unordered idea-dump block inside a TaskNode. */
export interface BrainstormBlock {
  type: "brainstorm";
  id: string;
  /** Use `bullet.id` as the React key — never use array index. */
  bullets: BrainstormBullet[];
}

/** Discriminated union of all block types that can live inside a TaskNode. */
export type ChildBlock = DescriptionBlock | StepsBlock | BrainstormBlock;

// ─── Node data payloads (React Flow `data` fields) ───────────────────────────

/**
 * Data stored in a Task node's React Flow `data` field.
 *
 * Serialisable fields: `title`, `status`, `collapsed`, `childBlocks`.
 * Callback fields (on*) are injected at runtime and must not be persisted.
 */
export interface TaskData extends Record<string, unknown> {
  title: string;
  status: TaskStatus;
  /** Whether the child-task subtree is hidden. */
  collapsed: boolean;
  /** Ordered list of content blocks attached to this task. */
  childBlocks: ChildBlock[];
  /** When true the title input receives focus on mount (new-node flow). */
  isEditing?: boolean;
  // ── Runtime callbacks — injected by AstrolabeCanvas, never serialised ──
  onStatusChange?: (id: string, status: TaskStatus) => void;
  onTitleCommit?: (id: string, title: string) => void;
  onBlocksChange?: (id: string, blocks: ChildBlock[]) => void;
  onToggleCollapse?: (id: string) => void;
  onAddChildTask?: (parentId: string) => void;
}

/**
 * Data stored in an IndexCard node's React Flow `data` field.
 *
 * Serialisable fields: `title`, `description`, `status`.
 * Callback fields (on*) are injected at runtime and must not be persisted.
 */
export interface IndexCardData extends Record<string, unknown> {
  title: string;
  description: string;
  status: NodeStatus;
  /** When true the title input receives focus on mount (new-node flow). */
  isEditing?: boolean;
  // ── Runtime callbacks — injected by AstrolabeCanvas, never serialised ──
  onComplete: (id: string) => void;
  onUncomplete?: (id: string) => void;
  /** Called when the orbit-menu button is pressed; receives the node's screen centre. */
  onOrbit: (id: string, x: number, y: number) => void;
  onStatusChange?: (id: string, status: NodeStatus) => void;
  onTitleCommit?: (id: string, title: string) => void;
  onDescriptionCommit?: (id: string, description: string) => void;
}

/** Data stored in the singleton GoldenNode (Oracle). */
export interface GoldenNodeData extends Record<string, unknown> {
  /** Toggles the Oracle chat panel open/closed. */
  onToggleOracle: () => void;
}

/** Data stored in a Note node. */
export interface NoteNodeData extends Record<string, unknown> {
  text: string;
  /** When true the textarea receives focus on mount (new-node flow). */
  isEditing?: boolean;
  onTextCommit?: (id: string, text: string) => void;
}

/** Data stored in a Milestone node. */
export interface MilestoneNodeData extends Record<string, unknown> {
  label: string;
  /** When true the label input receives focus on mount (new-node flow). */
  isEditing?: boolean;
  onLabelCommit?: (id: string, label: string) => void;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

/**
 * Discriminated union representing what the context menu is anchored to.
 * `null` means the menu is closed.
 */
export type ContextMenuState =
  | { type: "node"; x: number; y: number; nodeId: string }
  | { type: "edge"; x: number; y: number; edgeId: string; currentLabel: string }
  | null;

// ─── Database record types ────────────────────────────────────────────────────

/**
 * A workspace profile — each profile has a fully isolated canvas and AI context.
 * Mirrors the `profiles` SQLite table.
 */
export interface ProfileRecord {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
}

/**
 * Mirrors the `nodes` SQLite row.
 *
 * `status` is typed as `string` rather than `NodeStatus | TaskStatus` because
 * both enums share the same column and the DB performs no validation — the
 * correct enum is applied by the consuming component after loading.
 *
 * `body` stores type-specific JSON:
 *  - task nodes  → `JSON.stringify(ChildBlock[])`
 *  - other nodes → plain text description (or empty string)
 */
export interface NodeRecord {
  id: string;
  profile_id: string;
  node_type: NodeType;
  title: string;
  /** JSON-encoded ChildBlock[] for task nodes; description text otherwise. */
  body: string;
  /** Raw status string — cast to NodeStatus or TaskStatus after loading. */
  status: string;
  position_x: number;
  position_y: number;
  /** `null` for top-level nodes; parent task id for child tasks. */
  parent_id: string | null;
}

/**
 * Mirrors the `edges` SQLite row.
 * `label` is an optional relationship description (e.g. "Requires", "Informs").
 */
export interface EdgeRecord {
  id: string;
  profile_id: string;
  source_id: string;
  target_id: string;
  label: string;
}

// ─── AI / Orbit types ────────────────────────────────────────────────────────

/** A single AI-generated suggestion shown in the OrbitMenu. */
export interface AISuggestion {
  title: string;
  description: string;
}

/** UI state for the floating orbit suggestions ring. */
export interface OrbitMenuState {
  visible: boolean;
  anchorNodeId: string | null;
  x: number;
  y: number;
  suggestions: AISuggestion[];
  loading: boolean;
}

// ─── Build Mode ───────────────────────────────────────────────────────────────

/**
 * A single node in a Build plan returned by Astro's build mode.
 * `node_type` is limited to types that can be mass-created from a prompt.
 */
export interface BuildNode {
  id: string;
  node_type: "index_card" | "note" | "milestone";
  title: string;
  description: string;
}

/** A directed connection in a Build plan. */
export interface BuildEdge {
  source: string;
  target: string;
  label: string;
}

/** The full canvas plan returned by the `build_from_prompt` Tauri command. */
export interface BuildPlan {
  nodes: BuildNode[];
  edges: BuildEdge[];
  summary: string;
}

// ─── Chat types ───────────────────────────────────────────────────────────────

/**
 * A named conversation session stored in `chat_sessions`.
 * `date` is an ISO date string (YYYY-MM-DD) used for folder grouping.
 */
export interface ChatSession {
  id: string;
  profile_id: string;
  title: string;
  date: string;
  created_at: string;
}

/** A single message in a chat session, stored in `chat_messages`. */
export interface ChatMessage {
  id: number;
  session_id: string;
  /** "user" | "astro" */
  role: string;
  text: string;
  /** True if this message triggered a Build plan that was placed on the canvas. */
  built: boolean;
  created_at: string;
}
