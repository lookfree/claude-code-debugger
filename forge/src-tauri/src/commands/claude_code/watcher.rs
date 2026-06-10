use notify::{Config as NConfig, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Payload emitted as `files:changed` Tauri event
#[derive(Clone, serde::Serialize)]
pub struct FilesChangedPayload {
    pub paths: Vec<String>,
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn start(app: AppHandle, watch_dirs: Vec<PathBuf>) -> Result<Self, String> {
        let last_event: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
        let app_clone = app.clone();
        let last_clone = last_event.clone();

        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, _>| {
                if let Ok(event) = res {
                    let mut last = last_clone.lock().unwrap();
                    let now = Instant::now();
                    if last.map(|t| now.duration_since(t) > Duration::from_millis(300)).unwrap_or(true) {
                        *last = Some(now);
                        let paths: Vec<String> = event.paths.iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect();
                        let _ = app_clone.emit("files:changed", FilesChangedPayload { paths });
                    }
                }
            },
            NConfig::default(),
        ).map_err(|e| e.to_string())?;

        let mut w = watcher;
        for dir in &watch_dirs {
            if dir.exists() {
                w.watch(dir, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
            }
        }

        Ok(FileWatcher { _watcher: w })
    }
}

pub struct WatcherState(pub Mutex<Option<FileWatcher>>);
