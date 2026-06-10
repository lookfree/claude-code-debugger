// forge/src-tauri/src/db/sessions.rs
use rusqlite::{params, Connection};
use crate::commands::usage::parser::ParsedSession;
use crate::commands::usage::query::SessionRow;

pub fn upsert_session(conn: &Connection, s: &ParsedSession) -> Result<bool, String> {
    // Check if exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
        [&s.session_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    // sessions table has started_at NOT NULL, use 0 as fallback
    let started_at = s.started_at.unwrap_or(0);

    conn.execute(
        "INSERT OR REPLACE INTO sessions
         (id, tool, working_dir, started_at, ended_at, duration_sec, model,
          input_tokens, output_tokens, cost_usd, raw_source)
         VALUES (?1, 'claude-code', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            s.session_id,
            s.working_dir,
            started_at,
            s.ended_at,
            s.ended_at.zip(s.started_at).map(|(e, st)| e - st),
            s.model,
            s.input_tokens,
            s.output_tokens,
            s.cost_usd,
            s.source_path,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(!exists)
}

pub fn get_session(conn: &Connection, id: &str) -> Result<Option<SessionRow>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, tool, working_dir, started_at, ended_at, duration_sec,
                model, input_tokens, output_tokens, cost_usd
         FROM sessions WHERE id=?1",
    ).map_err(|e| e.to_string())?;

    let mut rows = stmt.query([id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(SessionRow {
            id:           row.get(0).map_err(|e| e.to_string())?,
            tool:         row.get(1).map_err(|e| e.to_string())?,
            working_dir:  row.get(2).map_err(|e| e.to_string())?,
            started_at:   row.get(3).map_err(|e| e.to_string())?,
            ended_at:     row.get(4).map_err(|e| e.to_string())?,
            duration_sec: row.get(5).map_err(|e| e.to_string())?,
            model:        row.get(6).map_err(|e| e.to_string())?,
            input_tokens: row.get(7).map_err(|e| e.to_string())?,
            output_tokens:row.get(8).map_err(|e| e.to_string())?,
            cost_usd:     row.get(9).map_err(|e| e.to_string())?,
        }))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;
    use crate::commands::usage::parser::ParsedSession;
    use rusqlite::Connection;

    fn mem_conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c
    }

    fn make_session(id: &str, dir: &str, ts: i64) -> ParsedSession {
        ParsedSession {
            session_id: id.to_string(),
            working_dir: dir.to_string(),
            started_at: Some(ts),
            ended_at: Some(ts + 3600),
            model: Some("claude-sonnet-4-5".to_string()),
            input_tokens: 1000,
            output_tokens: 200,
            cost_usd: 0.006,
            source_path: format!("/tmp/{}.jsonl", id),
        }
    }

    #[test]
    fn upsert_inserts_new() {
        let conn = mem_conn();
        let s = make_session("sess-1", "~/projects/foo", 1700000000);
        let is_new = upsert_session(&conn, &s).unwrap();
        assert!(is_new);
        let row = get_session(&conn, "sess-1").unwrap().unwrap();
        assert_eq!(row.working_dir, "~/projects/foo");
        assert_eq!(row.input_tokens, 1000);
    }

    #[test]
    fn upsert_updates_existing() {
        let conn = mem_conn();
        let mut s = make_session("sess-2", "~/projects/bar", 1700000000);
        upsert_session(&conn, &s).unwrap();
        s.input_tokens = 5000;
        s.output_tokens = 800;
        let is_new = upsert_session(&conn, &s).unwrap();
        assert!(!is_new);
        let row = get_session(&conn, "sess-2").unwrap().unwrap();
        assert_eq!(row.input_tokens, 5000);
    }

    #[test]
    fn upsert_multiple_sessions_same_dir() {
        let conn = mem_conn();
        upsert_session(&conn, &make_session("a1", "~/p/x", 1700000000)).unwrap();
        upsert_session(&conn, &make_session("a2", "~/p/x", 1700001000)).unwrap();
        // Both should exist
        assert!(get_session(&conn, "a1").unwrap().is_some());
        assert!(get_session(&conn, "a2").unwrap().is_some());
    }
}
