mod db;
mod ai;

use db::DbState;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Determine the data directory path at runtime via Tauri's app_data_dir
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Open (or create) the SQLite database in the app's data directory
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data).expect("failed to create app data dir");
            let db_path = app_data.join("astrolabe.db");

            let conn = Connection::open(&db_path)
                .expect("failed to open SQLite database");

            // Initialize schema immediately
            db::init_schema(&conn).expect("failed to initialize DB schema");

            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Profile commands
            db::create_profile,
            db::get_all_profiles,
            db::delete_profile,
            db::update_profile,
            // DB commands
            db::init_db,
            db::upsert_node,
            db::delete_node,
            db::get_all_nodes,
            db::upsert_edge,
            db::delete_edge,
            db::get_all_edges,
            db::log_quest_event,
            // Chat commands
            db::create_chat_session,
            db::get_chat_sessions,
            db::get_chat_messages,
            db::add_chat_message,
            db::update_chat_session_title,
            db::delete_chat_session,
            // AI commands
            ai::generate_node_ideas,
            ai::cluster_ideas,
            ai::ask_oracle,
            ai::build_from_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

