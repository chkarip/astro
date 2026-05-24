# Astrolabe — GitHub Copilot Instructions

## Project Overview

Astrolabe is a **local-first, AI-augmented life-mapping and project-orchestration** desktop app.
Stack: **Tauri v2 (Rust)** + **React 18 / Vite / TypeScript** + **Ollama** (local AI) + **SQLite** (rusqlite).
Canvas engine: `@xyflow/react` (React Flow v12). Animations: Framer Motion. Styling: Tailwind CSS v4.

See `astrolabe-architecture.md` for the full reference document.

---

## Repository Layout

```
d:\Astrolabe\
├── astrolabe-architecture.md   ← always-up-to-date architecture reference
└── astrolabe/                  ← the app
    ├── src/                    ← React + TypeScript frontend
    │   ├── App.tsx             ← canvas root + AstrolabeCanvas component
    │   ├── types/index.ts      ← ALL shared types (edit here, not inline)
    │   ├── constants/status.ts ← status colours/labels/cycles
    │   ├── utils/nodeSerializer.ts ← Node ↔ NodeRecord serialisation
    │   ├── hooks/useDatabase.ts    ← Tauri invoke wrappers
    │   ├── hooks/useAutoLayout.ts  ← Dagre layout
    │   └── components/
    │       ├── nodes/          ← IndexCardNode, GoldenNode, NoteNode, MilestoneNode, TaskNode
    │       ├── edges/          ← CustomEdge
    │       ├── Observatory.tsx ← home / profile selection screen
    │       ├── OraclePanel.tsx ← AI chat + Build Mode side panel
    │       ├── OrbitMenu.tsx   ← radial AI suggestion menu
    │       ├── NodeToolbar.tsx ← bottom spawn bar + layout toggle
    │       ├── CommandPalette.tsx ← ⌘K palette
    │       └── ContextMenu.tsx    ← right-click menu
    └── src-tauri/src/
        ├── lib.rs  ← Tauri app entry + invoke_handler registration
        ├── db.rs   ← SQLite schema, all DB Tauri commands
        └── ai.rs   ← Ollama integration, all AI Tauri commands
```

---

## Coding Conventions

### TypeScript / React

- All shared types live in `src/types/index.ts`. Do **not** define types inline in component files.
- Node `data` interfaces extend `Record<string, unknown>` (React Flow requirement). Runtime callbacks (`on*`) are **never serialised** to the DB.
- Use `nodeToRecord()` from `src/utils/nodeSerializer.ts` whenever converting a React Flow `Node` to a `NodeRecord` for persistence.
- Status constants (colours, labels, cycle arrays) live in `src/constants/status.ts`. Do not hard-code status strings in components.
- Prefer `useCallback` for all event handlers passed to child components.
- Use `useRef` to capture mutable state that closures need without triggering re-renders (e.g. `equippedRef`, `layoutModeRef`).

### Rust / Tauri

- All Tauri commands are registered in `lib.rs` `invoke_handler`. Adding a new command requires both the `#[tauri::command]` fn in `db.rs` / `ai.rs` **and** registration in `lib.rs`.
- DB access goes through `DbState(Mutex<Connection>)`. Always lock with `.lock().unwrap()` — panicking is acceptable here; a poisoned DB mutex means the process is already broken.
- Errors from Rust commands surface as `string` rejections in JS. Wrap `invoke()` calls in `try/catch` and log; do not crash the UI.
- The `ASTROLABE_SYSTEM_KNOWLEDGE` constant in `ai.rs` is injected into every Oracle/Build prompt. Keep it up to date when node types or features change.

### Styling

- All colours follow the **Academic Blueprint** palette (deep navy `#0d1b2e`, blueprint blue `#1e3a5f`, off-white `#ccd6f6`, amber `#f5a623`). See `astrolabe-architecture.md`.
- Use inline `style` objects for component-specific one-off styles. Use Tailwind utility classes for layout/positioning when appropriate.
- Framer Motion `motion.div` with `type: "spring"` for interactive elements; CSS transitions for bulk node position animations (layout tidy).

---

## Node Types Quick Reference

| `node_type` | Component | Key data fields |
|-------------|-----------|----------------|
| `golden` | `GoldenNode` | — (singleton, click opens Oracle) |
| `index_card` | `IndexCardNode` | `title`, `description`, `status: NodeStatus` |
| `note` | `NoteNode` | `text` |
| `milestone` | `MilestoneNode` | `label` (double-click to edit) |
| `task` | `TaskNode` | `title`, `status: TaskStatus`, `collapsed`, `childBlocks: ChildBlock[]` |

**Status types are separate:**
- `NodeStatus` (IndexCard): `"pending" | "in_progress" | "done" | "blocked"`
- `TaskStatus` (Task): `"pending" | "inprogress" | "done" | "blocked"` (no underscore in `inprogress`)

**Child block types** (live inside `TaskNode`, persisted as JSON in `nodes.body`):
- `DescriptionBlock` — `{ type: "description", id, content }`
- `StepsBlock` — `{ type: "steps", id, items: { id, text, done }[] }`
- `BrainstormBlock` — `{ type: "brainstorm", id, bullets: { id, text }[] }`

---

## AI Models

| Model | Constant | Use |
|-------|----------|-----|
| `gemma4:e4b` | `FAST_MODEL` in `ai.rs` | Sprout (generate ideas), Cluster, quick completions |
| `qwen2.5:7b-instruct` | `DEEP_MODEL` in `ai.rs` | Oracle chat, Build Mode |

Both talk to local Ollama at `http://localhost:11434`.

---

## Database Commands (TypeScript side)

```typescript
// Profile
invoke('create_profile',  { id, name, description, color })
invoke('get_all_profiles')
invoke('delete_profile',  { id })
invoke('update_profile',  { id, name, description })

// Nodes / Edges
invoke('upsert_node',  { node: NodeRecord })
invoke('delete_node',  { id })
invoke('get_all_nodes',{ profileId }) → NodeRecord[]
invoke('upsert_edge',  { edge: EdgeRecord })
invoke('delete_edge',  { id })
invoke('get_all_edges',{ profileId }) → EdgeRecord[]
invoke('log_quest_event', { nodeId, event, payload })

// Chat
invoke('create_chat_session',       { profileId, id, title, date })
invoke('get_chat_sessions',         { profileId })
invoke('get_chat_messages',         { sessionId })
invoke('add_chat_message',          { sessionId, role, text, built })
invoke('update_chat_session_title', { id, title })
invoke('delete_chat_session',       { id })

// AI
invoke('generate_node_ideas', { title, body, context }) → AISuggestion[]
invoke('cluster_ideas',       { context })              → ClusterPlan
invoke('ask_oracle',          { query, context, sessionId, profileId }) → string
invoke('build_from_prompt',   { prompt, context, profileId }) → BuildPlan
```

---

## Key Patterns

### Adding a new node type
1. Define its `data` interface in `src/types/index.ts`
2. Create `src/components/nodes/MyNewNode.tsx`
3. Export it from `src/components/nodes/index.ts`
4. Register it in `nodeTypes` in `App.tsx`
5. Add a `case` to `nodeToRecord()` in `src/utils/nodeSerializer.ts`
6. Add to the `node_type` literal union in `src/types/index.ts`
7. Update `ASTROLABE_SYSTEM_KNOWLEDGE` in `src-tauri/src/ai.rs`
8. Update `astrolabe-architecture.md`

### Adding a new Tauri command
1. Write the `#[tauri::command]` fn in `db.rs` or `ai.rs`
2. Register it in the `invoke_handler` in `lib.rs`
3. Add a wrapper in `src/hooks/useDatabase.ts` (or call `invoke` directly for one-off uses)

### Layout
- Call `runLayout("tree")` for top-to-bottom or `runLayout("horizontal")` for left-to-right
- `runLayout` only operates on **top-level nodes** (no `parentId`). Child tasks stay relative to their parent.
- Orphan nodes (no edges) are parked below the main graph automatically.

---

## Development Commands

```bash
# Full dev (Tauri + React)
cd astrolabe && npm run tauri dev

# Frontend only
cd astrolabe && npm run dev

# TypeScript check
cd astrolabe && npx tsc --noEmit

# Production build
cd astrolabe && npm run tauri build
```

**Ollama must be running** with `gemma4:e4b` and `qwen2.5:7b-instruct` pulled before launching.
