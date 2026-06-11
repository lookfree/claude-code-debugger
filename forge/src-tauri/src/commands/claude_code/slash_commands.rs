use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use crate::config::atomic::write_atomic;
use crate::commands::claude_code::utils::safe_join;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommand {
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    pub file_path: Option<String>,
    pub location: String,
    /// Relative path within the commands directory, e.g. "subdir/file.md"
    pub rel_path: Option<String>,
}

fn commands_dir(base_dir: &Path) -> PathBuf { base_dir.join("commands") }

/// Scan a commands dir for .md files at depth 0 (flat) AND depth 1 (nested one level).
/// Depth-0: commands/<name>.md  → rel_path = "<name>.md"
/// Depth-1: commands/<dir>/<file>.md → rel_path = "<dir>/<file>.md"
fn scan_commands_dir(dir: &Path, location: &str) -> Vec<SlashCommand> {
    let mut cmds = vec![];
    let entries = match fs::read_dir(dir) { Ok(e) => e, Err(_) => return cmds };
    for entry in entries.flatten() {
        let path = entry.path();
        let meta = match fs::metadata(&path) { Ok(m) => m, Err(_) => continue };
        if meta.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
            // Flat .md file at root of commands dir
            if let Ok(content) = fs::read_to_string(&path) {
                let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                let rel = format!("{}.md", name);
                cmds.push(SlashCommand {
                    name,
                    description: None,
                    content,
                    file_path: Some(path.to_string_lossy().to_string()),
                    location: location.to_string(),
                    rel_path: Some(rel),
                });
            }
        } else if meta.is_dir() {
            // One-level deep: commands/<subdir>/<any>.md
            let sub_dir = &path;
            let sub_entries = match fs::read_dir(sub_dir) { Ok(e) => e, Err(_) => continue };
            let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            for sub_entry in sub_entries.flatten() {
                let sub_path = sub_entry.path();
                let sub_meta = match fs::metadata(&sub_path) { Ok(m) => m, Err(_) => continue };
                if sub_meta.is_file() && sub_path.extension().and_then(|e| e.to_str()) == Some("md") {
                    if let Ok(content) = fs::read_to_string(&sub_path) {
                        let file_stem = sub_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                        let name = format!("{}/{}", dir_name, file_stem);
                        let rel = format!("{}/{}.md", dir_name, file_stem);
                        cmds.push(SlashCommand {
                            name,
                            description: None,
                            content,
                            file_path: Some(sub_path.to_string_lossy().to_string()),
                            location: location.to_string(),
                            rel_path: Some(rel),
                        });
                    }
                }
            }
        }
    }
    cmds
}

pub fn get_slash_commands(base_dir: &Path) -> Result<Vec<SlashCommand>, String> {
    Ok(scan_commands_dir(&commands_dir(base_dir), "user"))
}

/// Get slash commands from both user base_dir and optionally a project dir.
/// project_path: optional project root; scans <project>/.claude/commands/
pub fn get_slash_commands_with_project(base_dir: &Path, project_path: Option<&str>) -> Result<Vec<SlashCommand>, String> {
    let mut cmds = scan_commands_dir(&commands_dir(base_dir), "user");
    if let Some(proj) = project_path {
        let proj_cmds_dir = PathBuf::from(proj).join(".claude").join("commands");
        cmds.extend(scan_commands_dir(&proj_cmds_dir, "project"));
    }
    Ok(cmds)
}

pub fn get_slash_command(base_dir: &Path, name: &str) -> Result<Option<SlashCommand>, String> {
    Ok(get_slash_commands(base_dir)?.into_iter().find(|c| c.name == name))
}

pub fn save_slash_command(base_dir: &Path, cmd: &SlashCommand) -> Result<(), String> {
    let dir = commands_dir(base_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file_name = format!("{}.md", cmd.name);
    let path = safe_join(&dir, &file_name)?;
    write_atomic(&path, &cmd.content)
}

pub fn save_slash_command_raw(base_dir: &Path, name: &str, content: &str, rel_path: &str) -> Result<(), String> {
    let target = if rel_path.is_empty() {
        let dir = commands_dir(base_dir);
        let file_name = format!("{}.md", name);
        safe_join(&dir, &file_name)?
    } else {
        safe_join(base_dir, rel_path)?
    };
    if let Some(p) = target.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    write_atomic(&target, content)
}

pub fn delete_slash_command(base_dir: &Path, name: &str) -> Result<(), String> {
    let dir = commands_dir(base_dir);
    let file_name = format!("{}.md", name);
    let path = safe_join(&dir, &file_name)?;
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude")).ok_or_else(|| "no home".into()),
    }
}

#[tauri::command] pub fn cmd_get_slash_commands(base_dir: Option<String>, project_path: Option<String>) -> Result<Vec<SlashCommand>, String> { get_slash_commands_with_project(&resolve_base(base_dir)?, project_path.as_deref()) }
#[tauri::command] pub fn cmd_get_slash_command(name: String, base_dir: Option<String>) -> Result<Option<SlashCommand>, String> { get_slash_command(&resolve_base(base_dir)?, &name) }
#[tauri::command] pub fn cmd_save_slash_command(cmd: SlashCommand, base_dir: Option<String>) -> Result<(), String> { save_slash_command(&resolve_base(base_dir)?, &cmd) }
#[tauri::command] pub fn cmd_save_slash_command_raw(name: String, content: String, file_path: String, base_dir: Option<String>) -> Result<(), String> { save_slash_command_raw(&resolve_base(base_dir)?, &name, &content, &file_path) }
#[tauri::command] pub fn cmd_delete_slash_command(name: String, base_dir: Option<String>) -> Result<(), String> { delete_slash_command(&resolve_base(base_dir)?, &name) }

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn slash_command_roundtrip() {
        let dir = tempdir().unwrap();
        let cmd = SlashCommand { name: "foo".into(), description: None, content: "# foo".into(), file_path: None, location: "user".into(), rel_path: None };
        save_slash_command(dir.path(), &cmd).unwrap();
        let loaded = get_slash_command(dir.path(), "foo").unwrap().unwrap();
        assert_eq!(loaded.content, "# foo");
        delete_slash_command(dir.path(), "foo").unwrap();
        assert!(get_slash_command(dir.path(), "foo").unwrap().is_none());
    }

    #[test]
    fn save_slash_command_rejects_traversal_in_name() {
        let dir = tempdir().unwrap();
        let cmd = SlashCommand { name: "../evil".into(), description: None, content: "bad".into(), file_path: None, location: "user".into(), rel_path: None };
        let result = save_slash_command(dir.path(), &cmd);
        assert!(result.is_err(), "expected Err for name '../evil'");
        // nothing written outside the tempdir base
        assert!(!dir.path().parent().unwrap().join("evil.md").exists());
    }

    #[test]
    fn save_slash_command_raw_rejects_traversal_in_rel_path() {
        let dir = tempdir().unwrap();
        let result = save_slash_command_raw(dir.path(), "x", "bad", "../../evil.md");
        assert!(result.is_err(), "expected Err for rel_path '../../evil.md'");
    }

    #[test]
    fn save_slash_command_raw_rejects_absolute_rel_path() {
        let dir = tempdir().unwrap();
        let result = save_slash_command_raw(dir.path(), "x", "bad", "/tmp/evil.md");
        assert!(result.is_err(), "expected Err for absolute rel_path");
    }

    #[test]
    fn delete_slash_command_rejects_traversal_in_name() {
        let dir = tempdir().unwrap();
        let result = delete_slash_command(dir.path(), "../evil");
        assert!(result.is_err(), "expected Err for name '../evil'");
    }

    // A4 tests
    #[test]
    fn a4_flat_commands_still_work() {
        let dir = tempdir().unwrap();
        let cmds_dir = dir.path().join("commands");
        fs::create_dir_all(&cmds_dir).unwrap();
        fs::write(cmds_dir.join("flat.md"), "# flat command").unwrap();
        let cmds = get_slash_commands(dir.path()).unwrap();
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].name, "flat");
        assert_eq!(cmds[0].rel_path.as_deref(), Some("flat.md"));
        assert_eq!(cmds[0].location, "user");
    }

    #[test]
    fn a4_nested_commands_discovered() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("commands").join("mydir");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("mycmd.md"), "# nested command").unwrap();
        let cmds = get_slash_commands(dir.path()).unwrap();
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].name, "mydir/mycmd");
        assert_eq!(cmds[0].rel_path.as_deref(), Some("mydir/mycmd.md"));
        assert_eq!(cmds[0].location, "user");
        assert_eq!(cmds[0].content, "# nested command");
    }

    #[test]
    fn a4_project_scope_commands_scanned() {
        let base = tempdir().unwrap();
        let proj = tempdir().unwrap();
        // User command
        let user_cmds = base.path().join("commands");
        fs::create_dir_all(&user_cmds).unwrap();
        fs::write(user_cmds.join("user-cmd.md"), "# user cmd").unwrap();
        // Project command
        let proj_cmds = proj.path().join(".claude").join("commands");
        fs::create_dir_all(&proj_cmds).unwrap();
        fs::write(proj_cmds.join("proj-cmd.md"), "# project cmd").unwrap();

        let cmds = get_slash_commands_with_project(base.path(), Some(proj.path().to_str().unwrap())).unwrap();
        assert_eq!(cmds.len(), 2);
        let locations: Vec<&str> = cmds.iter().map(|c| c.location.as_str()).collect();
        assert!(locations.contains(&"user"));
        assert!(locations.contains(&"project"));
    }

    #[test]
    fn a4_flat_and_nested_mixed() {
        let dir = tempdir().unwrap();
        let cmds_dir = dir.path().join("commands");
        fs::create_dir_all(&cmds_dir).unwrap();
        // flat
        fs::write(cmds_dir.join("flat.md"), "flat content").unwrap();
        // nested
        let sub = cmds_dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("nested.md"), "nested content").unwrap();
        let cmds = get_slash_commands(dir.path()).unwrap();
        assert_eq!(cmds.len(), 2);
        let names: Vec<&str> = cmds.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"flat"));
        assert!(names.contains(&"sub/nested"));
    }
}
