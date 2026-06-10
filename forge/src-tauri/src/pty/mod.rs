pub mod session;

use crate::pty::session::PtySession;
use std::collections::HashMap;
use std::sync::Mutex;

/// Session registry: maps session_id -> PtySession.
/// Use a std::sync::Mutex with short critical sections (no .await held).
pub struct SessionRegistry {
    inner: Mutex<HashMap<String, PtySession>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        SessionRegistry {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn insert(&self, session: PtySession) -> Result<(), String> {
        self.inner
            .lock()
            .map_err(|e| format!("registry lock poisoned: {e}"))?
            .insert(session.id.clone(), session);
        Ok(())
    }

    pub fn with<F, T>(&self, id: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&PtySession) -> Result<T, String>,
    {
        let guard = self
            .inner
            .lock()
            .map_err(|e| format!("registry lock poisoned: {e}"))?;
        let session = guard
            .get(id)
            .ok_or_else(|| format!("session not found: {id}"))?;
        f(session)
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("registry lock poisoned: {e}"))?;
        // Kill before removing
        if let Some(s) = guard.get(id) {
            let _ = s.kill(); // best-effort, ignore error
        }
        guard.remove(id);
        Ok(())
    }

    pub fn list(&self) -> Vec<(String, String, String)> {
        self.inner
            .lock()
            .map_or_else(|_| vec![], |g| {
                g.values()
                    .map(|s| {
                        (
                            s.id.clone(),
                            s.tool.clone(),
                            s.working_dir.to_string_lossy().to_string(),
                        )
                    })
                    .collect()
            })
    }
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}
