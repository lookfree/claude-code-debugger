use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyNode {
    pub id: String,
    pub node_type: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyGraph {
    pub nodes: Vec<DependencyNode>,
    pub edges: Vec<DependencyEdge>,
}

pub fn get_dependency_graph(base_dir: &Path) -> Result<DependencyGraph, String> { todo!() }

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude")).ok_or_else(|| "no home".into()),
    }
}

#[tauri::command]
pub fn cmd_get_dependency_graph(base_dir: Option<String>) -> Result<DependencyGraph, String> {
    get_dependency_graph(&resolve_base(base_dir)?)
}
