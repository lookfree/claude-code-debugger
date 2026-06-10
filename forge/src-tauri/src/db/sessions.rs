// forge/src-tauri/src/db/sessions.rs
use rusqlite::Connection;
use crate::commands::usage::parser::ParsedSession;
use crate::commands::usage::query::SessionRow;

/// Upsert 一条解析好的会话，返回是否为新插入（vs 更新）
pub fn upsert_session(conn: &Connection, s: &ParsedSession) -> Result<bool, String> {
    todo!()
}

/// 通过 sessionId 查询
pub fn get_session(conn: &Connection, id: &str) -> Result<Option<SessionRow>, String> {
    todo!()
}
