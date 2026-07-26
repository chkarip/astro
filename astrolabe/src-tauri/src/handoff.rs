use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const HANDOFF_FILENAME: &str = "ergon-astrolabe-handoff.json";
const MAX_HANDOFF_AGE_MS: u64 = 30_000;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErgonHandoff {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub astro_project: Option<String>,
    #[serde(default)]
    pub create_new: Option<bool>,
    pub timestamp: u64,
}

/// Reads and deletes the handoff file Ergon writes to the OS temp dir when the
/// user clicks the 🔭 button on a project card. Consumed exactly once so a
/// second launch of Astrolabe (or a stale leftover file) doesn't replay it.
#[tauri::command]
pub fn take_pending_handoff() -> Option<ErgonHandoff> {
    let path = std::env::temp_dir().join(HANDOFF_FILENAME);
    let contents = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);

    let handoff: ErgonHandoff = serde_json::from_str(&contents).ok()?;

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    if now_ms.saturating_sub(handoff.timestamp) > MAX_HANDOFF_AGE_MS {
        return None;
    }

    Some(handoff)
}
