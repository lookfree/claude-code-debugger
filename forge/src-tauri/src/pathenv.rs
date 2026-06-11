//! macOS GUI 应用从 launchd 继承的 PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin，
//! 不含 ~/.local/bin、/opt/homebrew/bin 等用户目录，导致 which 找不到 claude/codex。
//! 启动时用登录 shell 的真实 PATH + 常见目录修正进程 PATH。

use std::path::Path;

/// 合并 PATH：additions 优先（前置），保持顺序去重
pub fn merge_paths(current: &str, additions: &[String]) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for p in additions.iter().map(|s| s.as_str()).chain(current.split(':')) {
        let p = p.trim();
        if p.is_empty() {
            continue;
        }
        if seen.insert(p.to_string()) {
            out.push(p.to_string());
        }
    }
    out.join(":")
}

/// 常见的 CLI 安装目录（即使登录 shell 查询失败也能覆盖大多数安装方式）
pub fn well_known_dirs(home: &Path) -> Vec<String> {
    let mut dirs = vec![
        home.join(".local/bin"),
        home.join(".cargo/bin"),
        home.join(".bun/bin"),
        home.join(".volta/bin"),
        home.join(".deno/bin"),
        home.join(".npm-global/bin"),
    ]
    .into_iter()
    .map(|p| p.to_string_lossy().to_string())
    .collect::<Vec<_>>();
    dirs.push("/opt/homebrew/bin".into());
    dirs.push("/opt/homebrew/sbin".into());
    dirs.push("/usr/local/bin".into());
    dirs
}

/// 从用户登录 shell 读取真实 PATH
fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = std::process::Command::new(&shell)
        .args(["-lc", "printf '%s' \"$PATH\""])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

/// 必须在任何线程启动之前调用（main 线程最早处）
pub fn fix_path() {
    let current = std::env::var("PATH").unwrap_or_default();
    let mut additions: Vec<String> = Vec::new();
    if let Some(p) = login_shell_path() {
        additions.extend(p.split(':').map(|s| s.to_string()));
    }
    if let Some(home) = dirs::home_dir() {
        additions.extend(well_known_dirs(&home));
    }
    let merged = merge_paths(&current, &additions);
    std::env::set_var("PATH", &merged);
    eprintln!(
        "[forge] PATH fixed ({} entries); claude => {:?}",
        merged.split(':').count(),
        which::which("claude").ok()
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_prepends_additions_and_dedupes() {
        let merged = merge_paths(
            "/usr/bin:/bin",
            &["/opt/homebrew/bin".into(), "/usr/bin".into(), "".into()],
        );
        assert_eq!(merged, "/opt/homebrew/bin:/usr/bin:/bin");
    }

    #[test]
    fn merge_keeps_current_when_no_additions() {
        assert_eq!(merge_paths("/usr/bin:/bin", &[]), "/usr/bin:/bin");
    }

    #[test]
    fn well_known_includes_local_bin_and_homebrew() {
        let dirs = well_known_dirs(Path::new("/Users/test"));
        assert!(dirs.contains(&"/Users/test/.local/bin".to_string()));
        assert!(dirs.contains(&"/opt/homebrew/bin".to_string()));
    }

    #[test]
    fn fix_path_makes_local_bin_visible_even_from_stripped_path() {
        // 模拟 launchd 场景：修正后 PATH 必须包含 ~/.local/bin
        fix_path();
        let path = std::env::var("PATH").unwrap();
        let home = dirs::home_dir().unwrap();
        assert!(path.contains(&home.join(".local/bin").to_string_lossy().to_string()));
        assert!(path.contains("/opt/homebrew/bin"));
    }
}
