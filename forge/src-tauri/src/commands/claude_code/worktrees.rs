use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
    pub is_locked: bool,
}

pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, String> { todo!() }
pub fn add_worktree(repo_path: &str, branch: &str, path: &str, new_branch: bool) -> Result<WorktreeInfo, String> { todo!() }
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String> { todo!() }

#[tauri::command] pub fn cmd_list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> { list_worktrees(&repo_path) }
#[tauri::command] pub fn cmd_add_worktree(repo_path: String, branch: String, path: String, new_branch: bool) -> Result<WorktreeInfo, String> { add_worktree(&repo_path, &branch, &path, new_branch) }
#[tauri::command] pub fn cmd_remove_worktree(repo_path: String, worktree_path: String, force: bool) -> Result<(), String> { remove_worktree(&repo_path, &worktree_path, force) }
