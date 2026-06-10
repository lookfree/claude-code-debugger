use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,
    pub config: Value,
}

pub fn get_mcp_servers(base_dir: &Path) -> Result<Vec<McpServer>, String> { todo!() }
pub fn get_mcp_server(base_dir: &Path, name: &str) -> Result<Option<McpServer>, String> { todo!() }
pub fn save_mcp_server(base_dir: &Path, name: &str, config: Value) -> Result<(), String> { todo!() }
pub fn delete_mcp_server(base_dir: &Path, name: &str) -> Result<(), String> { todo!() }
pub fn test_mcp_connection(_name: &str) -> Result<bool, String> { todo!() }

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
