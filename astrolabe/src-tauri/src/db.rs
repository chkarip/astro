use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

// ─── Shared DB state ──────────────────────────────────────────────────────────

pub struct DbState(pub Mutex<Connection>);

// ─── Data types ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeRecord {
    pub id: String,
    pub profile_id: String,
    pub node_type: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub position_x: f64,
    pub position_y: f64,
    pub parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeRecord {
    pub id: String,
    pub profile_id: String,
    pub source_id: String,
    pub target_id: String,
    pub label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSession {
    pub id: String,
    pub profile_id: String,
    pub title: String,
    pub date: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub text: String,
    pub built: bool,
    pub created_at: String,
}

// ─── Schema initialization ────────────────────────────────────────────────────

pub fn init_schema(conn: &Connection) -> Result<()> {
    // Step 1: create tables and indexes that don't depend on migrated columns.
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS profiles (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL DEFAULT 'New Profile',
            description TEXT NOT NULL DEFAULT '',
            color       TEXT NOT NULL DEFAULT '#4A9EFF',
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO profiles (id, name, color)
        VALUES ('default-profile', 'Default', '#4A9EFF');

        CREATE TABLE IF NOT EXISTS nodes (
            id          TEXT PRIMARY KEY,
            profile_id  TEXT NOT NULL DEFAULT 'default-profile',
            node_type   TEXT NOT NULL DEFAULT 'index_card',
            title       TEXT NOT NULL DEFAULT '',
            body        TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL DEFAULT 'pending',
            position_x  REAL NOT NULL DEFAULT 0,
            position_y  REAL NOT NULL DEFAULT 0,
            parent_id   TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS edges (
            id          TEXT PRIMARY KEY,
            profile_id  TEXT NOT NULL DEFAULT 'default-profile',
            source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
            target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
            label       TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS quest_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id     TEXT,
            event       TEXT NOT NULL,
            payload     TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
        CREATE INDEX IF NOT EXISTS idx_quest_node   ON quest_logs(node_id);

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id          TEXT PRIMARY KEY,
            profile_id  TEXT NOT NULL DEFAULT 'default-profile',
            title       TEXT NOT NULL DEFAULT 'New Conversation',
            date        TEXT NOT NULL DEFAULT (date('now')),
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            role        TEXT NOT NULL,
            text        TEXT NOT NULL,
            built       INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_chat_sessions_profile ON chat_sessions(profile_id, date);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
    ")?;

    // Step 2: migrate older databases that predate the profile_id column.
    // This must run before we try to create indexes that reference profile_id.
    migrate_add_profile_id(conn)?;

    // Step 3: create the profile-scoped indexes now that the column is guaranteed present.
    conn.execute_batch("
        CREATE INDEX IF NOT EXISTS idx_nodes_profile ON nodes(profile_id);
        CREATE INDEX IF NOT EXISTS idx_edges_profile ON edges(profile_id);
    ")?;

    Ok(())
}

/// Adds `profile_id` to `nodes` and `edges` if those tables predate this feature.
/// Safe to call on fresh installs — it's a no-op when the column already exists.
fn migrate_add_profile_id(conn: &Connection) -> Result<()> {
    if !column_exists(conn, "nodes", "profile_id")? {
        conn.execute_batch(
            "ALTER TABLE nodes ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default-profile';"
        )?;
    }
    if !column_exists(conn, "edges", "profile_id")? {
        conn.execute_batch(
            "ALTER TABLE edges ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default-profile';"
        )?;
    }
    Ok(())
}

fn column_exists(conn: &Connection, table: &str, col: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|name| name == col);
    Ok(exists)
}

// ─── Profile commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_profile(
    state: State<'_, DbState>,
    id: String,
    name: String,
    description: String,
    color: String,
) -> Result<ProfileRecord, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO profiles (id, name, description, color) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, description, color],
    )
    .map_err(|e| e.to_string())?;
    let profile = conn.query_row(
        "SELECT id, name, description, color, created_at FROM profiles WHERE id = ?1",
        params![id],
        |row| Ok(ProfileRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        }),
    )
    .map_err(|e| e.to_string())?;
    Ok(profile)
}

#[tauri::command]
pub fn get_all_profiles(state: State<'_, DbState>) -> Result<Vec<ProfileRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, color, created_at FROM profiles ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok(ProfileRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn delete_profile(state: State<'_, DbState>, id: String) -> Result<(), String> {
    if id == "default-profile" {
        return Err("Cannot delete the default profile".to_string());
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // Delete edges first (profile_id scoped), then nodes, then the profile itself.
    // This handles both new installs (where FK cascades exist) and upgrades
    // (where ALTER TABLE added profile_id without an FK constraint).
    conn.execute("DELETE FROM edges WHERE profile_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM nodes WHERE profile_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_profile(
    state: State<'_, DbState>,
    id: String,
    name: String,
    description: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE profiles SET name = ?1, description = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![name, description, id],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn init_db(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    init_schema(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_node(state: State<'_, DbState>, node: NodeRecord) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO nodes (id, profile_id, node_type, title, body, status, position_x, position_y, parent_id, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            profile_id = excluded.profile_id,
            node_type  = excluded.node_type,
            title      = excluded.title,
            body       = excluded.body,
            status     = excluded.status,
            position_x = excluded.position_x,
            position_y = excluded.position_y,
            parent_id  = excluded.parent_id,
            updated_at = datetime('now')",
        params![
            node.id, node.profile_id, node.node_type, node.title, node.body,
            node.status, node.position_x, node.position_y, node.parent_id
        ],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_node(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM nodes WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_nodes(state: State<'_, DbState>, profile_id: String) -> Result<Vec<NodeRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, profile_id, node_type, title, body, status, position_x, position_y, parent_id FROM nodes WHERE profile_id = ?1 ORDER BY created_at")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![profile_id], |row| {
            Ok(NodeRecord {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                node_type: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
                status: row.get(5)?,
                position_x: row.get(6)?,
                position_y: row.get(7)?,
                parent_id: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn upsert_edge(state: State<'_, DbState>, edge: EdgeRecord) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO edges (id, profile_id, source_id, target_id, label)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            profile_id = excluded.profile_id,
            source_id  = excluded.source_id,
            target_id  = excluded.target_id,
            label      = excluded.label",
        params![edge.id, edge.profile_id, edge.source_id, edge.target_id, edge.label],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_edge(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM edges WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_edges(state: State<'_, DbState>, profile_id: String) -> Result<Vec<EdgeRecord>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, profile_id, source_id, target_id, label FROM edges WHERE profile_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![profile_id], |row| {
            Ok(EdgeRecord {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                source_id: row.get(2)?,
                target_id: row.get(3)?,
                label: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn log_quest_event(
    state: State<'_, DbState>,
    node_id: String,
    event: String,
    payload: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO quest_logs (node_id, event, payload) VALUES (?1, ?2, ?3)",
        params![node_id, event, payload],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// ─── Chat commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_chat_session(
    state: State<'_, DbState>,
    id: String,
    profile_id: String,
    title: String,
) -> Result<ChatSession, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chat_sessions (id, profile_id, title) VALUES (?1, ?2, ?3)",
        params![id, profile_id, title],
    )
    .map_err(|e| e.to_string())?;
    let session = conn.query_row(
        "SELECT id, profile_id, title, date, created_at FROM chat_sessions WHERE id = ?1",
        params![id],
        |row| Ok(ChatSession {
            id: row.get(0)?,
            profile_id: row.get(1)?,
            title: row.get(2)?,
            date: row.get(3)?,
            created_at: row.get(4)?,
        }),
    )
    .map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
pub fn get_chat_sessions(
    state: State<'_, DbState>,
    profile_id: String,
) -> Result<Vec<ChatSession>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, profile_id, title, date, created_at FROM chat_sessions WHERE profile_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![profile_id], |row| Ok(ChatSession {
            id: row.get(0)?,
            profile_id: row.get(1)?,
            title: row.get(2)?,
            date: row.get(3)?,
            created_at: row.get(4)?,
        }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_chat_messages(
    state: State<'_, DbState>,
    session_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, session_id, role, text, built, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![session_id], |row| Ok(ChatMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            role: row.get(2)?,
            text: row.get(3)?,
            built: row.get::<_, i64>(4)? != 0,
            created_at: row.get(5)?,
        }))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn add_chat_message(
    state: State<'_, DbState>,
    session_id: String,
    role: String,
    text: String,
    built: bool,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chat_messages (session_id, role, text, built) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, role, text, built as i64],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_chat_session_title(
    state: State<'_, DbState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE chat_sessions SET title = ?1 WHERE id = ?2",
        params![title, id],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chat_session(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM chat_messages WHERE session_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM chat_sessions WHERE id = ?1", params![id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}
