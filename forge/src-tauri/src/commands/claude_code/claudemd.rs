use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMdFile {
    pub location: String,
    pub file_path: String,
    pub content: String,
    pub exists: bool,
}

pub fn get_claudemd(base_dir: &Path) -> Result<ClaudeMdFile, String> { todo!() }
pub fn get_all_claudemd(base_dir: &Path, project_path: Option<&Path>) -> Result<Vec<ClaudeMdFile>, String> { todo!() }
pub fn save_claudemd(path: &Path, content: &str) -> Result<(), String> { todo!() }

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude")).ok_or_else(|| "no home".into()),
    }
}

#[tauri::command]
pub fn cmd_get_claudemd(base_dir: Option<String>) -> Result<ClaudeMdFile, String> {
    get_claudemd(&resolve_base(base_dir)?)
}
#[tauri::command]
pub fn cmd_get_all_claudemd(base_dir: Option<String>, project_path: Option<String>) -> Result<Vec<ClaudeMdFile>, String> {
    get_all_claudemd(&resolve_base(base_dir)?, project_path.as_deref().map(Path::new))
}
#[tauri::command]
pub fn cmd_save_claudemd(file_path: String, content: String) -> Result<(), String> {
    save_claudemd(Path::new(&file_path), &content)
}
