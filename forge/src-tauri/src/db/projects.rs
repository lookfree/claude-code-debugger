// forge/src-tauri/src/db/projects.rs
use rusqlite::{params, Connection};
use uuid::Uuid;

pub fn recompute_project(conn: &Connection, tool: &str, directory: &str) -> Result<(), String> {
    // Aggregate from sessions
    let (session_count, total_input, total_output, total_cost, last_used): (i64, i64, i64, f64, Option<i64>) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
                    COALESCE(SUM(cost_usd),0.0), MAX(started_at)
             FROM sessions WHERE tool=?1 AND working_dir=?2",
            params![tool, directory],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .map_err(|e| e.to_string())?;

    let total_tokens = total_input + total_output;

    // Check if project row exists
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE tool=?1 AND directory=?2)",
        params![tool, directory],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    if exists {
        conn.execute(
            "UPDATE projects SET session_count=?1, total_tokens=?2, total_cost_usd=?3,
             last_used_at=?4 WHERE tool=?5 AND directory=?6",
            params![session_count, total_tokens, total_cost, last_used, tool, directory],
        ).map_err(|e| e.to_string())?;
    } else {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO projects (id, tool, directory, pinned, last_used_at, session_count,
             total_tokens, total_cost_usd) VALUES (?1,?2,?3,0,?4,?5,?6,?7)",
            params![id, tool, directory, last_used, session_count, total_tokens, total_cost],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn recompute_all_projects(conn: &Connection) -> Result<usize, String> {
    // Get all unique (tool, working_dir) combos from sessions
    let mut stmt = conn.prepare(
        "SELECT DISTINCT tool, working_dir FROM sessions"
    ).map_err(|e| e.to_string())?;
    let combos: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let count = combos.len();
    for (tool, dir) in combos {
        recompute_project(conn, &tool, &dir)?;
    }
    Ok(count)
}

pub fn set_pinned(conn: &Connection, tool: &str, directory: &str, pinned: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE projects SET pinned=?1 WHERE tool=?2 AND directory=?3",
        params![pinned as i32, tool, directory],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;
    use crate::commands::usage::parser::ParsedSession;
    use crate::db::sessions::upsert_session;
    use rusqlite::Connection;

    fn mem_conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        c
    }

    fn insert_sess(conn: &Connection, id: &str, tool: &str, dir: &str, ts: i64, inp: i64, out: i64) {
        let s = ParsedSession {
            session_id: id.to_string(),
            working_dir: dir.to_string(),
            started_at: Some(ts),
            ended_at: Some(ts + 600),
            model: Some("claude-sonnet-4-5".to_string()),
            input_tokens: inp,
            output_tokens: out,
            cost_usd: (inp as f64 / 1000.0) * 0.003 + (out as f64 / 1000.0) * 0.015,
            source_path: "/tmp/x.jsonl".to_string(),
        };
        // Manually insert with tool since ParsedSession doesn't carry tool
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, tool, working_dir, started_at, ended_at, model, input_tokens, output_tokens, cost_usd, raw_source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                s.session_id, tool, s.working_dir,
                s.started_at, s.ended_at, s.model,
                s.input_tokens, s.output_tokens, s.cost_usd, s.source_path
            ],
        ).unwrap();
    }

    #[test]
    fn recompute_aggregates_correctly() {
        let conn = mem_conn();
        insert_sess(&conn, "s1", "claude-code", "/p/foo", 1700000000, 1000, 100);
        insert_sess(&conn, "s2", "claude-code", "/p/foo", 1700001000, 2000, 200);
        recompute_project(&conn, "claude-code", "/p/foo").unwrap();

        let row: (i64, i64) = conn.query_row(
            "SELECT session_count, total_tokens FROM projects WHERE tool='claude-code' AND directory='/p/foo'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(row.0, 2);           // 2 sessions
        assert_eq!(row.1, 3300);        // 1000+100+2000+200
    }

    #[test]
    fn set_pinned_toggles() {
        let conn = mem_conn();
        insert_sess(&conn, "s3", "claude-code", "/p/bar", 1700000000, 100, 10);
        recompute_project(&conn, "claude-code", "/p/bar").unwrap();
        set_pinned(&conn, "claude-code", "/p/bar", true).unwrap();
        let pinned: i64 = conn.query_row(
            "SELECT pinned FROM projects WHERE tool='claude-code' AND directory='/p/bar'",
            [], |r| r.get(0),
        ).unwrap();
        assert_eq!(pinned, 1);
    }

    #[test]
    fn recompute_all_handles_multiple_tools() {
        let conn = mem_conn();
        insert_sess(&conn, "s4", "claude-code", "/p/a", 1700000000, 500, 50);
        insert_sess(&conn, "s5", "codex-cli",   "/p/b", 1700000000, 300, 30);
        let count = recompute_all_projects(&conn).unwrap();
        assert_eq!(count, 2); // 2 unique (tool, directory) combos
    }
}
