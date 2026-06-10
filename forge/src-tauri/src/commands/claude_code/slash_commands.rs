use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommand {
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    pub file_path: Option<String>,
    pub location: String,
}

pub fn get_slash_commands(base_dir: &Path) -> Result<Vec<SlashCommand>, String> { todo!() }
pub fn get_slash_command(base_dir: &Path, name: &str) -> Result<Option<SlashCommand>, String> { todo!() }
pub fn save_slash_command(base_dir: &Path, cmd: &SlashCommand) -> Result<(), String> { todo!() }
pub fn save_slash_command_raw(base_dir: &Path, name: &str, content: &str, rel_path: &str) -> Result<(), String> { todo!() }
pub fn delete_slash_command(base_dir: &Path, name: &str) -> Result<(), String> { todo!() }

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude")).ok_or_else(|| "no home".into()),
    }
}

#[tauri::command] pub fn cmd_get_slash_commands(base_dir: Option<String>) -> Result<Vec<SlashCommand>, String> { get_slash_commands(&resolve_base(base_dir)?) }
#[tauri::command] pub fn cmd_get_slash_command(name: String, base_dir: Option<String>) -> Result<Option<SlashCommand>, String> { get_slash_command(&resolve_base(base_dir)?, &name) }
#[tauri::command] pub fn cmd_save_slash_command(cmd: SlashCommand, base_dir: Option<String>) -> Result<(), String> { save_slash_command(&resolve_base(base_dir)?, &cmd) }
#[tauri::command] pub fn cmd_save_slash_command_raw(name: String, content: String, file_path: String, base_dir: Option<String>) -> Result<(), String> { save_slash_command_raw(&resolve_base(base_dir)?, &name, &content, &file_path) }
#[tauri::command] pub fn cmd_delete_slash_command(name: String, base_dir: Option<String>) -> Result<(), String> { delete_slash_command(&resolve_base(base_dir)?, &name) }
