// forge/src-tauri/src/commands/usage/query.rs
use crate::commands::model_switcher::commands::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

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
    pub date: String,           // "YYYY-MM-DD"
    pub claude_tokens: i64,
    pub codex_tokens: i64,
    pub total_cost_usd: f64,
}

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<SessionRow> {
    Ok(SessionRow {
        id:           row.get(0)?,
        tool:         row.get(1)?,
        working_dir:  row.get(2)?,
        started_at:   row.get(3)?,
        ended_at:     row.get(4)?,
        duration_sec: row.get(5)?,
        model:        row.get(6)?,
        input_tokens: row.get(7)?,
        output_tokens:row.get(8)?,
        cost_usd:     row.get(9)?,
    })
}

#[tauri::command]
pub fn get_sessions(
    tool: String,
    limit: Option<i64>,
    offset: Option<i64>,
    db: State<'_, DbState>,
) -> Result<Vec<SessionRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50);
    let off = offset.unwrap_or(0);
    let mut stmt = conn.prepare(
        "SELECT id, tool, working_dir, started_at, ended_at, duration_sec,
                model, input_tokens, output_tokens, cost_usd
         FROM sessions WHERE tool=?1
         ORDER BY started_at DESC LIMIT ?2 OFFSET ?3",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![tool, lim, off], row_to_session)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    rows
}

#[tauri::command]
pub fn get_projects(
    tool: String,
    db: State<'_, DbState>,
) -> Result<Vec<ProjectRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, tool, directory, pinned, last_used_at, session_count, total_tokens, total_cost_usd
         FROM projects WHERE tool=?1
         ORDER BY pinned DESC, last_used_at DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![tool], |row| Ok(ProjectRow {
        id:            row.get(0)?,
        tool:          row.get(1)?,
        directory:     row.get(2)?,
        pinned:        row.get::<_, i64>(3)? == 1,
        last_used_at:  row.get(4)?,
        session_count: row.get(5)?,
        total_tokens:  row.get(6)?,
        total_cost_usd:row.get(7)?,
    }))
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string());
    rows
}

#[tauri::command]
pub fn pin_project(
    tool: String,
    directory: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    crate::db::projects::set_pinned(&conn, &tool, &directory, true)
}

#[tauri::command]
pub fn unpin_project(
    tool: String,
    directory: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    crate::db::projects::set_pinned(&conn, &tool, &directory, false)
}

#[tauri::command]
pub fn get_dashboard(db: State<'_, DbState>) -> Result<DashboardSummary, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Today = Unix day boundary (seconds from epoch to start of today UTC)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let today_start = now - (now % 86400);

    let (today_input, today_output, today_cost): (i64, i64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), COALESCE(SUM(cost_usd),0.0)
         FROM sessions WHERE started_at >= ?1",
        params![today_start],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).map_err(|e| e.to_string())?;

    let claude_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(input_tokens+output_tokens),0) FROM sessions WHERE tool='claude-code' AND started_at>=?1",
        params![today_start], |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let codex_today: i64 = conn.query_row(
        "SELECT COALESCE(SUM(input_tokens+output_tokens),0) FROM sessions WHERE tool='codex-cli' AND started_at>=?1",
        params![today_start], |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    let recent: Vec<SessionRow> = {
        let mut stmt = conn.prepare(
            "SELECT id, tool, working_dir, started_at, ended_at, duration_sec,
                    model, input_tokens, output_tokens, cost_usd
             FROM sessions ORDER BY started_at DESC LIMIT 10",
        ).map_err(|e| e.to_string())?;
        let x = stmt.query_map([], row_to_session)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string());
        x?
    };

    Ok(DashboardSummary {
        today_input_tokens:  today_input,
        today_output_tokens: today_output,
        today_cost_usd:      today_cost,
        claude_today_tokens: claude_today,
        codex_today_tokens:  codex_today,
        recent_sessions:     recent,
    })
}

#[tauri::command]
pub fn get_daily_usage(days: i64, db: State<'_, DbState>) -> Result<Vec<DailyUsage>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let since = now - days * 86400;

    let mut stmt = conn.prepare(
        "SELECT
            strftime('%Y-%m-%d', started_at, 'unixepoch') as d,
            SUM(CASE WHEN tool='claude-code' THEN input_tokens+output_tokens ELSE 0 END),
            SUM(CASE WHEN tool='codex-cli'   THEN input_tokens+output_tokens ELSE 0 END),
            SUM(cost_usd)
         FROM sessions
         WHERE started_at >= ?1
         GROUP BY d
         ORDER BY d ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![since], |row| Ok(DailyUsage {
        date:          row.get(0)?,
        claude_tokens: row.get(1)?,
        codex_tokens:  row.get(2)?,
        total_cost_usd:row.get(3)?,
    }))
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string());
    rows
}
