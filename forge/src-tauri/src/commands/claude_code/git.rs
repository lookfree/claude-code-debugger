use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

pub fn git_status(repo_path: &str) -> Result<GitStatus, String> { todo!() }
pub fn git_stage(repo_path: &str, paths: &[String]) -> Result<(), String> { todo!() }
pub fn git_commit(repo_path: &str, message: &str) -> Result<String, String> { todo!() }
pub fn git_push(repo_path: &str) -> Result<(), String> { todo!() }
pub fn git_branches(repo_path: &str) -> Result<Vec<BranchInfo>, String> { todo!() }
pub fn git_checkout(repo_path: &str, branch: &str) -> Result<(), String> { todo!() }
pub fn git_log(repo_path: &str, limit: usize) -> Result<Vec<CommitInfo>, String> { todo!() }

#[tauri::command] pub fn cmd_git_status(repo_path: String) -> Result<GitStatus, String> { git_status(&repo_path) }
#[tauri::command] pub fn cmd_git_stage(repo_path: String, paths: Vec<String>) -> Result<(), String> { git_stage(&repo_path, &paths) }
#[tauri::command] pub fn cmd_git_commit(repo_path: String, message: String) -> Result<String, String> { git_commit(&repo_path, &message) }
#[tauri::command] pub fn cmd_git_push(repo_path: String) -> Result<(), String> { git_push(&repo_path) }
#[tauri::command] pub fn cmd_git_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> { git_branches(&repo_path) }
#[tauri::command] pub fn cmd_git_checkout(repo_path: String, branch: String) -> Result<(), String> { git_checkout(&repo_path, &branch) }
#[tauri::command] pub fn cmd_git_log(repo_path: String, limit: usize) -> Result<Vec<CommitInfo>, String> { git_log(&repo_path, limit) }
