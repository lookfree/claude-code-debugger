use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookEntry {
    pub name: String,
    pub hook_type: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookExecutionLog {
    pub id: String,
    pub hook_name: String,
    pub hook_type: String,
    pub command: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub timestamp: i64,
    pub success: bool,
}

pub fn get_hooks(base_dir: &Path) -> Result<Vec<HookEntry>, String> { todo!() }
pub fn save_hook_to_settings(base_dir: &Path, hook_type: &str, hook_config: Value, _location: &str, matcher_index: Option<usize>) -> Result<(), String> { todo!() }
pub fn delete_hook_from_settings(base_dir: &Path, hook_type: &str, matcher_index: usize, _location: &str) -> Result<(), String> { todo!() }
pub fn create_hook_script(path: &Path, content: &str) -> Result<String, String> { todo!() }
pub fn read_hook_script(path: &Path) -> Result<String, String> { todo!() }
pub fn get_hook_logs() -> Vec<HookExecutionLog> { todo!() }
pub fn clear_hook_logs() { todo!() }
pub fn get_hook_debug_logs(base_dir: &Path) -> Result<Vec<HookExecutionLog>, String> { todo!() }
pub fn launch_debug_session(hook_type: &str, project_path: Option<&str>) -> Result<Value, String> { todo!() }
pub fn stop_debug_session(pid: u32) -> bool { todo!() }

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude")).ok_or_else(|| "no home".into()),
    }
}

#[tauri::command]
pub fn cmd_get_hooks(base_dir: Option<String>) -> Result<Vec<HookEntry>, String> { get_hooks(&resolve_base(base_dir)?) }
#[tauri::command]
pub fn cmd_save_hook_to_settings(hook_type: String, hook_config: Value, location: String, base_dir: Option<String>, matcher_index: Option<usize>) -> Result<(), String> {
    save_hook_to_settings(&resolve_base(base_dir)?, &hook_type, hook_config, &location, matcher_index)
}
#[tauri::command]
pub fn cmd_delete_hook_from_settings(hook_type: String, matcher_index: usize, location: String, base_dir: Option<String>) -> Result<(), String> {
    delete_hook_from_settings(&resolve_base(base_dir)?, &hook_type, matcher_index, &location)
}
#[tauri::command]
pub fn cmd_create_hook_script(script_path: String, content: String) -> Result<String, String> {
    create_hook_script(Path::new(&script_path), &content)
}
#[tauri::command]
pub fn cmd_read_hook_script(script_path: String) -> Result<String, String> {
    read_hook_script(Path::new(&script_path))
}
#[tauri::command]
pub fn cmd_get_hook_logs() -> Vec<HookExecutionLog> { get_hook_logs() }
#[tauri::command]
pub fn cmd_clear_hook_logs() -> bool { clear_hook_logs(); true }
#[tauri::command]
pub fn cmd_get_hook_debug_logs(base_dir: Option<String>) -> Result<Vec<HookExecutionLog>, String> {
    get_hook_debug_logs(&resolve_base(base_dir)?)
}
#[tauri::command]
pub fn cmd_launch_debug_session(hook_type: String, project_path: Option<String>) -> Result<Value, String> {
    launch_debug_session(&hook_type, project_path.as_deref())
}
#[tauri::command]
pub fn cmd_stop_debug_session(pid: u32) -> bool { stop_debug_session(pid) }
