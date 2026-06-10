use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// A single PTY session: owns the master pty, child process, and writer.
pub struct PtySession {
    pub id: String,
    pub tool: String,
    pub working_dir: PathBuf,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
}

impl PtySession {
    /// Spawn a PTY session running `program` in `working_dir`.
    ///
    /// `on_output` is called from a reader thread with each chunk of bytes
    /// read from the pty master. `on_exit` is called once the reader thread
    /// exits (child process exited or pty closed).
    pub fn spawn(
        id: &str,
        tool: &str,
        program: &str,
        working_dir: &str,
        env_vars: Vec<(String, String)>,
        on_output: impl Fn(Vec<u8>) + Send + 'static,
        on_exit: impl Fn() + Send + 'static,
    ) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty failed: {e}"))?;

        let mut cmd = CommandBuilder::new(program);
        cmd.cwd(working_dir);

        // Inject custom env vars from the database
        for (k, v) in env_vars {
            cmd.env(k, v);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn failed: {e}"))?;

        let killer = child.clone_killer();

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take_writer failed: {e}"))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("try_clone_reader failed: {e}"))?;

        // Reader thread: read 4KB chunks, call on_output, exit on Ok(0)/Err
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => on_output(buf[..n].to_vec()),
                }
            }
            on_exit();
        });

        Ok(PtySession {
            id: id.to_string(),
            tool: tool.to_string(),
            working_dir: PathBuf::from(working_dir),
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            killer: Arc::new(Mutex::new(killer)),
        })
    }

    /// Write data to the pty stdin.
    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        self.writer
            .lock()
            .map_err(|e| format!("writer lock poisoned: {e}"))?
            .write_all(data)
            .map_err(|e| format!("write failed: {e}"))
    }

    /// Resize the terminal window.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .lock()
            .map_err(|e| format!("master lock poisoned: {e}"))?
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize failed: {e}"))
    }

    /// Kill the child process.
    pub fn kill(&self) -> Result<(), String> {
        self.killer
            .lock()
            .map_err(|e| format!("killer lock poisoned: {e}"))?
            .kill()
            .map_err(|e| format!("kill failed: {e}"))
    }
}

use std::io::Read;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Condvar, Mutex};
    use std::time::Duration;

    #[test]
    fn test_spawn_sh_echo() {
        // Test (a): spawn sh -c "echo forge-pty-test" and assert output contains "forge-pty-test"
        let working_dir = std::env::temp_dir().to_string_lossy().to_string();
        let collected: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
        let exited: Arc<(Mutex<bool>, Condvar)> = Arc::new((Mutex::new(false), Condvar::new()));

        let collected_clone = Arc::clone(&collected);
        let exited_clone = Arc::clone(&exited);

        let session = PtySession::spawn(
            "test-echo",
            "test-tool",
            "sh",
            &working_dir,
            vec![],
            move |bytes| {
                collected_clone.lock().unwrap().extend_from_slice(&bytes);
            },
            move || {
                let (lock, cvar) = &*exited_clone;
                *lock.lock().unwrap() = true;
                cvar.notify_all();
            },
        )
        .expect("spawn should succeed");

        // Write the echo command
        session
            .write(b"echo forge-pty-test\r")
            .expect("write should succeed");
        // Send exit
        session.write(b"exit\r").expect("write exit should succeed");

        // Wait for exit
        let (lock, cvar) = &*exited;
        let _ = cvar
            .wait_timeout_while(lock.lock().unwrap(), Duration::from_secs(5), |done| !*done)
            .unwrap();

        let output = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
        assert!(
            output.contains("forge-pty-test"),
            "expected 'forge-pty-test' in output, got: {output:?}"
        );
    }

    #[test]
    fn test_write_resize_kill_no_panic() {
        // Test (b): write/resize/kill APIs don't panic on a live sh session
        let working_dir = std::env::temp_dir().to_string_lossy().to_string();

        let session = PtySession::spawn(
            "test-rk",
            "test-tool",
            "sh",
            &working_dir,
            vec![],
            |_| {},
            || {},
        )
        .expect("spawn should succeed");

        // Write should not panic
        session.write(b"echo hello\r").expect("write should succeed");

        // Resize should not panic
        session
            .resize(100, 40)
            .expect("resize should succeed");

        // Kill should not panic
        session.kill().expect("kill should succeed");
    }
}
