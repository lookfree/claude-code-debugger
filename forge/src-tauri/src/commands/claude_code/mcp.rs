use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use crate::config::{atomic::write_atomic, claude::read_json};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,
    pub config: Value,
}

fn settings_path(base_dir: &Path) -> PathBuf { base_dir.join("settings.json") }

pub fn get_mcp_servers(base_dir: &Path) -> Result<Vec<McpServer>, String> {
    let doc = read_json(&settings_path(base_dir))?;
    let servers = doc.get("mcpServers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    Ok(servers.into_iter().map(|(k, v)| McpServer { name: k, config: v }).collect())
}

pub fn get_mcp_server(base_dir: &Path, name: &str) -> Result<Option<McpServer>, String> {
    Ok(get_mcp_servers(base_dir)?.into_iter().find(|s| s.name == name))
}

pub fn save_mcp_server(base_dir: &Path, name: &str, config: Value) -> Result<(), String> {
    let path = settings_path(base_dir);
    let mut doc = read_json(&path)?;
    let obj = doc.as_object_mut().ok_or("settings.json root not object")?;
    let mcp = obj.entry("mcpServers").or_insert(Value::Object(Default::default()));
    mcp.as_object_mut().ok_or("mcpServers not object")?.insert(name.to_string(), config);
    let pretty = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    if let Some(p) = path.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    write_atomic(&path, &pretty)
}

pub fn delete_mcp_server(base_dir: &Path, name: &str) -> Result<(), String> {
    let path = settings_path(base_dir);
    let mut doc = read_json(&path)?;
    if let Some(mcp) = doc.as_object_mut().and_then(|o| o.get_mut("mcpServers")).and_then(|v| v.as_object_mut()) {
        mcp.remove(name);
    }
    let pretty = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    write_atomic(&path, &pretty)
}

pub fn test_mcp_connection(_name: &str) -> Result<bool, String> {
    // Placeholder: real connection test requires per-server protocol knowledge
    Ok(false)
}

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude")).ok_or_else(|| "no home".into()),
    }
}

#[tauri::command] pub fn cmd_get_mcp_servers(base_dir: Option<String>) -> Result<Vec<McpServer>, String> { get_mcp_servers(&resolve_base(base_dir)?) }
#[tauri::command] pub fn cmd_save_mcp_server(name: String, config: Value, base_dir: Option<String>) -> Result<(), String> { save_mcp_server(&resolve_base(base_dir)?, &name, config) }
#[tauri::command] pub fn cmd_delete_mcp_server(name: String, base_dir: Option<String>) -> Result<(), String> { delete_mcp_server(&resolve_base(base_dir)?, &name) }
#[tauri::command] pub fn cmd_test_mcp_connection(name: String) -> Result<bool, String> { test_mcp_connection(&name) }

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use serde_json::json;

    #[test]
    fn mcp_save_delete_roundtrip() {
        let dir = tempdir().unwrap();
        save_mcp_server(dir.path(), "my-server", json!({"command": "npx", "args": ["-y", "my-mcp"]})).unwrap();
        let servers = get_mcp_servers(dir.path()).unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "my-server");
        delete_mcp_server(dir.path(), "my-server").unwrap();
        assert!(get_mcp_servers(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn mcp_save_preserves_other_settings_fields() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"hooks":{},"unknownField":"keep"}"#).unwrap();
        save_mcp_server(dir.path(), "srv", json!({})).unwrap();
        let doc = read_json(&path).unwrap();
        assert_eq!(doc["unknownField"], "keep");
    }
}
