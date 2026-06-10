use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDetection {
    pub name: String,
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

pub fn detect_env_tools() -> Result<Vec<ToolDetection>, String> { todo!() }

#[tauri::command]
pub fn cmd_detect_env_tools() -> Result<Vec<ToolDetection>, String> { detect_env_tools() }

#[tauri::command]
pub fn cmd_get_env_vars(state: tauri::State<crate::commands::model_switcher::commands::DbState>) -> Result<Vec<EnvVar>, String> {
    let conn = state.0.lock().unwrap();
    crate::db::get_env_vars(&conn)
        .map(|v| v.into_iter().map(|(k, val)| EnvVar { key: k, value: val }).collect())
}

#[tauri::command]
pub fn cmd_set_env_var(key: String, value: String, state: tauri::State<crate::commands::model_switcher::commands::DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO env_vars (key, value, created_at) VALUES (?1, ?2, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        rusqlite::params![key, value],
    ).map_err(|e| e.to_string()).map(|_| ())
}

#[tauri::command]
pub fn cmd_delete_env_var(key: String, state: tauri::State<crate::commands::model_switcher::commands::DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM env_vars WHERE key=?1", rusqlite::params![key])
        .map_err(|e| e.to_string()).map(|_| ())
}

#[tauri::command]
pub async fn cmd_test_api_connection() -> Result<bool, String> {
    test_api_connection_impl().await
}

pub async fn test_api_connection_impl() -> Result<bool, String> {
    let path = dirs::home_dir()
        .map(|h| h.join(".claude.json"))
        .ok_or("no home dir")?;
    let doc = crate::config::claude::read_json(&path)?;
    let api_key = doc.get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if api_key.is_empty() {
        return Err("no API key configured".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": "claude-haiku-4-5",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(resp.status().as_u16() < 500)
}
