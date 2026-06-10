use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub name: String,
    pub description: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub location: String,
    pub dependencies: Option<Vec<String>>,
}

fn agents_dir(base_dir: &Path) -> PathBuf { base_dir.join("agents") }

pub fn get_agents(base_dir: &Path) -> Result<Vec<Agent>, String> { todo!() }
pub fn get_agent(base_dir: &Path, name: &str) -> Result<Option<Agent>, String> { todo!() }
pub fn save_agent(base_dir: &Path, agent: &Agent) -> Result<(), String> { todo!() }
pub fn delete_agent(base_dir: &Path, name: &str) -> Result<(), String> { todo!() }

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude"))
            .ok_or_else(|| "no home dir".into()),
    }
}

#[tauri::command] pub fn cmd_get_agents(base_dir: Option<String>) -> Result<Vec<Agent>, String> { get_agents(&resolve_base(base_dir)?) }
#[tauri::command] pub fn cmd_get_agent(name: String, base_dir: Option<String>) -> Result<Option<Agent>, String> { get_agent(&resolve_base(base_dir)?, &name) }
#[tauri::command] pub fn cmd_save_agent(agent: Agent, base_dir: Option<String>) -> Result<(), String> { save_agent(&resolve_base(base_dir)?, &agent) }
#[tauri::command] pub fn cmd_delete_agent(name: String, base_dir: Option<String>) -> Result<(), String> { delete_agent(&resolve_base(base_dir)?, &name) }
