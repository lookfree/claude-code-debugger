// forge/src-tauri/src/commands/usage/query.rs
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct SessionRow {
    pub id: String,
    pub tool: String,
    pub working_dir: String,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub duration_sec: Option<i64>,
    pub model: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectRow {
    pub id: String,
    pub tool: String,
    pub directory: String,
    pub pinned: bool,
    pub last_used_at: Option<i64>,
    pub session_count: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
}

#[derive(Debug, Serialize)]
pub struct DashboardSummary {
    pub today_input_tokens: i64,
    pub today_output_tokens: i64,
    pub today_cost_usd: f64,
    pub claude_today_tokens: i64,
    pub codex_today_tokens: i64,
    pub recent_sessions: Vec<SessionRow>,
}

#[derive(Debug, Serialize)]
pub struct DailyUsage {
    pub date: String,          // "YYYY-MM-DD"
    pub claude_tokens: i64,
    pub codex_tokens: i64,
    pub total_cost_usd: f64,
}

#[tauri::command]
pub fn get_sessions(
    tool: String,
    limit: Option<i64>,
    offset: Option<i64>,
    db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>,
) -> Result<Vec<SessionRow>, String> { todo!() }

#[tauri::command]
pub fn get_projects(
    tool: String,
    db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>,
) -> Result<Vec<ProjectRow>, String> { todo!() }

#[tauri::command]
pub fn pin_project(
    tool: String,
    directory: String,
    db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>,
) -> Result<(), String> { todo!() }

#[tauri::command]
pub fn unpin_project(
    tool: String,
    directory: String,
    db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>,
) -> Result<(), String> { todo!() }

#[tauri::command]
pub fn get_dashboard(
    db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>,
) -> Result<DashboardSummary, String> { todo!() }

#[tauri::command]
pub fn get_daily_usage(
    days: i64,
    db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>,
) -> Result<Vec<DailyUsage>, String> { todo!() }
