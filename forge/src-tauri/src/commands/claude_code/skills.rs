use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub location: String, // "user" | "project"
    pub dependencies: Option<Vec<String>>,
}

fn skills_dir(base_dir: &Path) -> PathBuf {
    base_dir.join("skills")
}

pub fn get_skills(base_dir: &Path) -> Result<Vec<Skill>, String> { todo!() }
pub fn get_skill(base_dir: &Path, name: &str) -> Result<Option<Skill>, String> { todo!() }
pub fn save_skill(base_dir: &Path, skill: &Skill) -> Result<(), String> { todo!() }
pub fn delete_skill(base_dir: &Path, name: &str) -> Result<(), String> { todo!() }

fn resolve_base(base_dir: Option<String>) -> Result<PathBuf, String> {
    match base_dir {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir()
            .map(|h| h.join(".claude"))
            .ok_or_else(|| "cannot determine home dir".into()),
    }
}

#[tauri::command]
pub fn cmd_get_skills(base_dir: Option<String>) -> Result<Vec<Skill>, String> {
    get_skills(&resolve_base(base_dir)?)
}
#[tauri::command]
pub fn cmd_get_skill(name: String, base_dir: Option<String>) -> Result<Option<Skill>, String> {
    get_skill(&resolve_base(base_dir)?, &name)
}
#[tauri::command]
pub fn cmd_save_skill(skill: Skill, base_dir: Option<String>) -> Result<(), String> {
    save_skill(&resolve_base(base_dir)?, &skill)
}
#[tauri::command]
pub fn cmd_delete_skill(name: String, base_dir: Option<String>) -> Result<(), String> {
    delete_skill(&resolve_base(base_dir)?, &name)
}
