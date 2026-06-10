// forge/src-tauri/src/commands/usage/status.rs
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct RunningTool {
    pub tool: String,
    pub pid: u32,
    pub working_dir: Option<String>,
}

#[tauri::command]
pub fn get_running_tools() -> Result<Vec<RunningTool>, String> {
    todo!()
}
