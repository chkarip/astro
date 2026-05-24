# Astrolabe — Master Architecture

## Vision

Astrolabe is a local-first, AI-augmented life-mapping and project-orchestration desktop tool built with **Tauri v2 (Rust)** and **React (Vite/TypeScript)**. Users work on an infinite canvas of interconnected nodes managed by a central **Golden Node** AI oracle. All AI processing is fully local via **Ollama**. All data persists in a local **SQLite** database. Multiple isolated workspaces are supported via **Profiles**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Frontend framework | React 18 + Vite + TypeScript |
| Canvas / graph | @xyflow/react (React Flow v12) |
| Animations | Framer Motion |
| Styling | Tailwind CSS v4 (Academic Blueprint theme) |
| Auto-layout | Dagre.js |
| Local AI | Ollama (`gemma4:e4b` fast · `qwen2.5:7b-instruct` deep) |
| Database | SQLite via `rusqlite` (Tauri managed state) |

---

## Directory Structure

```
astrolabe/
├── src/
│   ├── App.tsx                        # Root canvas + ReactFlow provider
│   ├── index.css                      # Tailwind v4 + Blueprint theme vars
│   ├── main.tsx                       # React entry point
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── index.ts               # Re-exports all node components
│   │   │   ├── IndexCardNode.tsx      # Task card with status + orbit menu trigger
│   │   │   ├── GoldenNode.tsx         # Central AI oracle anchor node
│   │   │   ├── NoteNode.tsx           # Free-text sticky note node
│   │   │   ├── MilestoneNode.tsx      # Diamond checkpoint marker
│   │   │   └── TaskNode.tsx           # Collapsible task with child blocks
│   │   ├── edges/
│   │   │   └── CustomEdge.tsx         # Animated 90° architectural lines
│   │   ├── Observatory.tsx            # Profile selection / home screen
│   │   ├── OraclePanel.tsx            # AI chat + Build Mode side panel
│   │   ├── OrbitMenu.tsx              # Radial AI suggestion menu (right-click)
│   │   ├── NodeToolbar.tsx            # Bottom spawn bar + layout mode toggle
│   │   ├── CommandPalette.tsx         # ⌘K keyboard palette for node spawning
│   │   ├── ContextMenu.tsx            # Right-click context menu for nodes/edges
│   │   └── DeepSpaceBackground.tsx    # Animated nebula canvas background
│   ├── constants/
│   │   └── status.ts                  # Status config & cycle arrays for all node types
│   ├── context/
│   │   └── AIActivityContext.tsx      # Global AI loading state context
│   ├── hooks/
│   │   ├── useAutoLayout.ts           # Dagre tree/horizontal auto-layout hook
│   │   └── useDatabase.ts             # SQLite CRUD wrappers (Tauri invoke)
│   ├── types/
│   │   └── index.ts                   # All shared TypeScript types
│   └── utils/
│       └── nodeSerializer.ts          # Node ↔ NodeRecord serialisation helpers
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                     # Tauri app entry + command registration
│   │   ├── main.rs                    # Binary entry point
│   │   ├── db.rs                      # SQLite schema, CRUD, profile & chat commands
│   │   └── ai.rs                      # Ollama API integration (generate + stream)
│   ├── Cargo.toml                     # Rust dependencies
│   └── tauri.conf.json                # Tauri app config + plugin permissions
└── astrolabe-architecture.md          # This file
```

---

## Data Model (SQLite)

### `profiles` table
```sql
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'New Profile',
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#4A9EFF',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `nodes` table
```sql
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL DEFAULT 'default-profile',
  node_type   TEXT NOT NULL DEFAULT 'index_card',  -- see Node Types below
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',             -- JSON ChildBlock[] for task; text for others
  status      TEXT NOT NULL DEFAULT 'pending',
  position_x  REAL NOT NULL DEFAULT 0,
  position_y  REAL NOT NULL DEFAULT 0,
  parent_id   TEXT,                                 -- null for top-level; task id for child tasks
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `edges` table
```sql
CREATE TABLE edges (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL DEFAULT 'default-profile',
  source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT ''
);
```

### `quest_logs` table
```sql
CREATE TABLE quest_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id    TEXT,
  event      TEXT NOT NULL,   -- 'created' | 'started' | 'completed' | 'error'
  payload    TEXT,            -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `chat_sessions` table
```sql
CREATE TABLE chat_sessions (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL DEFAULT 'default-profile',
  title      TEXT NOT NULL DEFAULT 'New Conversation',
  date       TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `chat_messages` table
```sql
CREATE TABLE chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,   -- 'user' | 'astro'
  text       TEXT NOT NULL,
  built      INTEGER NOT NULL DEFAULT 0,  -- 1 = this message triggered a Build
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Node Types

| Type | React component | Description |
|------|----------------|-------------|
| `golden` | `GoldenNode` | Singleton anchor. Clicking opens the Oracle panel. |
| `index_card` | `IndexCardNode` | Standard task card. Has title, description, and status cycle. |
| `note` | `NoteNode` | Free-text sticky note. No status. |
| `milestone` | `MilestoneNode` | Diamond-shaped checkpoint. Double-click to edit label. |
| `task` | `TaskNode` | Collapsible task with expandable child blocks (description, steps, brainstorm). |

### Status Types

**`NodeStatus`** (IndexCard): `pending → in_progress → done → blocked`

**`TaskStatus`** (Task): `pending → inprogress → done → blocked`

### Task Child Blocks (`ChildBlock`)

Child blocks live inside a `TaskNode` and are persisted as a JSON array in `nodes.body`:

| Block type | Fields | Purpose |
|-----------|--------|---------|
| `description` | `id`, `content` | Free-text description textarea |
| `steps` | `id`, `items[]` (id, text, done) | Ordered checklist |
| `brainstorm` | `id`, `bullets[]` (id, text) | Unordered bullet list |

---

## AI Models

| Model | Role | Trigger |
|-------|------|---------|
| `gemma4:e4b` (fast) | Generate node ideas (Sprout), cluster suggestions, canvas-aware completions | OrbitMenu Sprout / Smart Cluster |
| `qwen2.5:7b-instruct` (deep) | Oracle chat, Build Mode (materialise nodes from text), context-aware Q&A | Oracle panel Chat/Build |

### Ollama Endpoints
- Base URL: `http://localhost:11434`
- Completion: `POST /api/generate` with `stream: false` and `format: "json"` (structured)
- Chat / Build: `POST /api/generate` with `stream: false` (free text or JSON plan)

---

## Key Features & Interactions

### Profiles (Observatory)
- Home screen rendered by `Observatory.tsx`
- Each profile has an isolated canvas, nodes, edges, and Oracle chat history
- Profiles have a display name, description, and accent colour
- Switching profiles loads a completely separate canvas

### Canvas & Layout
- `AstrolabeCanvas` (in `App.tsx`) wraps the React Flow instance
- Layout mode: `"tree"` (top-to-bottom Dagre) or `"horizontal"` (left-to-right Dagre)
- **Tidy** button in `NodeToolbar` re-runs Dagre layout and animates all nodes into position
- Orphan nodes (no edges) are parked below the connected graph

### OrbitMenu
1. Right-click or long-press a node → `OrbitMenu` opens with radial animation
2. **Sprout**: AI generates 4 creative sub-idea cards extending the selected node
3. Suggestions are draggable onto the canvas to create permanent nodes
4. **Cluster**: AI groups loose nodes into semantic `cluster_group` containers

### Oracle Panel (OraclePanel)
- Opened via the `GoldenNode` click handler
- Two modes: **Chat** (ask questions about the canvas) and **Build** (describe what to create)
- Build Mode returns a `BuildPlan` (nodes + edges JSON) that is materialised directly on the canvas
- Chat history is persisted per-profile in `chat_sessions` + `chat_messages` tables
- Sessions are grouped by date and shown in a folder-style sidebar

### Node Toolbar (NodeToolbar)
- Floating pill at the bottom-centre of the canvas
- **Spawn section**: equip a node type (Card, Note, Milestone); next canvas click places it
- **Block section**: equip a block type (Description, Steps, Brainstorm); routes to the last selected Task
- **Layout mode toggle** and **Tidy** button

### Command Palette (CommandPalette)
- Opens with `⌘K` / `Ctrl+K`
- Arrow-key navigation, Enter to spawn
- Shows all spawnable types with descriptions

### Context Menu (ContextMenu)
- Right-click on a node or edge
- Node actions: status change, delete, duplicate
- Edge actions: label edit, delete

---

## Tauri Commands (Rust ↔ React)

```typescript
// ── Profile ──────────────────────────────────────────────────────────────────
invoke('create_profile',  { id, name, description, color }) → ProfileRecord
invoke('get_all_profiles')                                  → ProfileRecord[]
invoke('delete_profile',  { id })
invoke('update_profile',  { id, name, description })

// ── Database ─────────────────────────────────────────────────────────────────
invoke('init_db')
invoke('upsert_node',     { node: NodeRecord })
invoke('delete_node',     { id })
invoke('get_all_nodes',   { profileId })                    → NodeRecord[]
invoke('upsert_edge',     { edge: EdgeRecord })
invoke('delete_edge',     { id })
invoke('get_all_edges',   { profileId })                    → EdgeRecord[]
invoke('log_quest_event', { nodeId, event, payload })

// ── Chat ─────────────────────────────────────────────────────────────────────
invoke('create_chat_session',        { profileId, id, title, date }) → ChatSession
invoke('get_chat_sessions',          { profileId })                   → ChatSession[]
invoke('get_chat_messages',          { sessionId })                   → ChatMessage[]
invoke('add_chat_message',           { sessionId, role, text, built })
invoke('update_chat_session_title',  { id, title })
invoke('delete_chat_session',        { id })

// ── AI ───────────────────────────────────────────────────────────────────────
invoke('generate_node_ideas', { title, body, context }) → AISuggestion[]  // gemma4:e4b
invoke('cluster_ideas',       { context })              → ClusterPlan      // gemma4:e4b
invoke('ask_oracle',          { query, context, sessionId, profileId }) → string  // qwen2.5:7b
invoke('build_from_prompt',   { prompt, context, profileId }) → BuildPlan  // qwen2.5:7b
```

---

## Styling: Academic Blueprint Theme

The UI evokes a technical architectural blueprint rendered in deep space:
- **Background**: Deep navy `#0d1b2e` (animated nebula via `DeepSpaceBackground`)
- **Surfaces**: Slightly lighter navy `#112240`
- **Borders/Grid**: Blueprint blue `#1e3a5f`
- **Accent lines**: Blueprint line blue `#2563eb`
- **Text**: Off-white `#ccd6f6`
- **Muted text**: `#8892b0`
- **Golden node**: Amber `#f5a623` with radiance glow
- **Success**: Mint green `#4ade80`
- **Font**: IBM Plex Mono (monospace) + Inter (display)

---

## Build & Development

```bash
# Start dev server (requires Rust toolchain)
npm run tauri dev

# Build production binary
npm run tauri build

# Frontend only (no Tauri)
npm run dev

# TypeScript check
npx tsc --noEmit
```

### Prerequisites
- Rust stable toolchain (`rustup`)
- Ollama running locally with `gemma4:e4b` and `qwen2.5:7b-instruct` models pulled
- Node.js 20+
