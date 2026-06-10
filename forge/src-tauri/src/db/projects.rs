// forge/src-tauri/src/db/projects.rs
use rusqlite::Connection;

/// 重新计算并 upsert 一个 (tool, directory) 的聚合统计
pub fn recompute_project(conn: &Connection, tool: &str, directory: &str) -> Result<(), String> {
    todo!()
}

/// 批量 recompute：遍历 sessions 表中所有 (tool, working_dir) 去重后重算
pub fn recompute_all_projects(conn: &Connection) -> Result<usize, String> {
    todo!()
}

pub fn set_pinned(conn: &Connection, tool: &str, directory: &str, pinned: bool) -> Result<(), String> {
    todo!()
}
