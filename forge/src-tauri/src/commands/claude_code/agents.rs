use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use crate::commands::claude_code::utils::safe_join;
use crate::config::atomic::write_atomic;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub name: String,
    pub description: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub location: String,
    pub dependencies: Option<Vec<String>>,
    #[serde(default = "default_source")]
    pub source: String, // "builtin" | "user"
}

fn default_source() -> String { "user".into() }

/// Claude Code 自带的内置代理（非文件，只读展示）
const BUILTIN_AGENTS: &[(&str, &str)] = &[
    ("general-purpose", "通用代理：研究复杂问题、搜索代码、执行多步骤任务"),
    ("Explore", "只读探索代理：大范围代码搜索与定位，返回结论而非文件内容"),
    ("Plan", "架构规划代理：设计实施方案、识别关键文件、权衡架构取舍"),
    ("statusline-setup", "配置 Claude Code 状态栏设置"),
    ("claude-code-guide", "解答 Claude Code / Agent SDK / Claude API 使用问题"),
];

fn agents_dir(base_dir: &Path) -> PathBuf { base_dir.join("agents") }

fn is_builtin(name: &str) -> bool {
    BUILTIN_AGENTS.iter().any(|(n, _)| *n == name)
}

pub fn get_agents(base_dir: &Path) -> Result<Vec<Agent>, String> {
    let mut agents: Vec<Agent> = BUILTIN_AGENTS
        .iter()
        .map(|(name, desc)| Agent {
            name: (*name).into(),
            description: (*desc).into(),
            content: None,
            file_path: None,
            location: "builtin".into(),
            dependencies: None,
            source: "builtin".into(),
        })
        .collect();
    let dir = agents_dir(base_dir);
    if !dir.exists() { return Ok(agents); }
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            agents.push(Agent {
                name: path.file_stem().unwrap().to_string_lossy().to_string(),
                description: extract_frontmatter_field(&raw, "description").unwrap_or_default(),
                content: Some(raw),
                file_path: Some(path.to_string_lossy().to_string()),
                location: "user".into(),
                dependencies: None,
                source: "user".into(),
            });
        }
    }
    Ok(agents)
}

pub fn get_agent(base_dir: &Path, name: &str) -> Result<Option<Agent>, String> {
    Ok(get_agents(base_dir)?.into_iter().find(|a| a.name == name))
}

pub fn save_agent(base_dir: &Path, agent: &Agent) -> Result<(), String> {
    if is_builtin(&agent.name) {
        return Err(format!("'{}' 是内置代理，不可覆盖", agent.name));
    }
    let dir = agents_dir(base_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file_name = format!("{}.md", agent.name);
    let path = safe_join(&dir, &file_name)?;
    let content = agent.content.clone().unwrap_or_else(|| {
        format!("---\nname: {}\ndescription: {}\n---\n", agent.name, agent.description)
    });
    write_atomic(&path, &content).map_err(|e| e.to_string())
}

pub fn delete_agent(base_dir: &Path, name: &str) -> Result<(), String> {
    if is_builtin(name) {
        return Err(format!("'{name}' 是内置代理，不可删除"));
    }
    let dir = agents_dir(base_dir);
    let file_name = format!("{}.md", name);
    let path = safe_join(&dir, &file_name)?;
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

fn extract_frontmatter_field(content: &str, field: &str) -> Option<String> {
    let fm = content.strip_prefix("---\n")?.split("\n---").next()?;
    fm.lines()
        .find(|l| l.starts_with(&format!("{}:", field)))
        .map(|l| l[field.len() + 1..].trim().to_string())
}

fn resolve_base(b: Option<String>) -> Result<PathBuf, String> {
    match b {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir().map(|h| h.join(".claude"))
            .ok_or_else(|| "no home dir".into()),
    }
}

#[tauri::command] pub fn cmd_get_agents(base_dir: Option<String>) -> Result<Vec<Agent>, String> { get_agents(&resolve_base(base_dir)?) }
#[tauri::command] pub fn cmd_get_agent(name: String, base_dir: Option<String>) -> Result<Option<Agent>, String> { get_agent(&resolve_base(base_dir)?, &name) }
#[tauri::command] pub fn cmd_save_agent(agent: Agent, base_dir: Option<String>) -> Result<(), String> { save_agent(&resolve_base(base_dir)?, &agent) }
#[tauri::command] pub fn cmd_delete_agent(name: String, base_dir: Option<String>) -> Result<(), String> { delete_agent(&resolve_base(base_dir)?, &name) }

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn agent_roundtrip() {
        let dir = tempdir().unwrap();
        let agent = Agent { name: "ag".into(), description: "d".into(), content: None, file_path: None, location: "user".into(), dependencies: None, source: "user".into() };
        save_agent(dir.path(), &agent).unwrap();
        assert!(get_agent(dir.path(), "ag").unwrap().is_some());
        delete_agent(dir.path(), "ag").unwrap();
        assert!(get_agent(dir.path(), "ag").unwrap().is_none());
    }

    #[test]
    fn save_agent_rejects_traversal_in_name() {
        let dir = tempdir().unwrap();
        let agent = Agent { name: "../evil".into(), description: "bad".into(), content: None, file_path: None, location: "user".into(), dependencies: None, source: "user".into() };
        let result = save_agent(dir.path(), &agent);
        assert!(result.is_err(), "expected Err for name '../evil'");
        assert!(!dir.path().parent().unwrap().join("evil.md").exists());
    }

    #[test]
    fn save_agent_rejects_absolute_name() {
        let dir = tempdir().unwrap();
        let agent = Agent { name: "/tmp/evil".into(), description: "bad".into(), content: None, file_path: None, location: "user".into(), dependencies: None, source: "user".into() };
        let result = save_agent(dir.path(), &agent);
        assert!(result.is_err(), "expected Err for absolute name");
    }

    #[test]
    fn delete_agent_rejects_traversal_in_name() {
        let dir = tempdir().unwrap();
        let result = delete_agent(dir.path(), "../evil");
        assert!(result.is_err(), "expected Err for name '../evil'");
    }

    // 内置代理与安装代理区分
    #[test]
    fn get_agents_includes_builtins_with_source() {
        let dir = tempdir().unwrap();
        let agents = get_agents(dir.path()).unwrap();
        assert!(!agents.is_empty(), "builtins should appear even with no user agents");
        assert!(agents.iter().all(|a| a.source == "builtin"));
        assert!(agents.iter().any(|a| a.name == "general-purpose"));
        assert!(agents.iter().any(|a| a.name == "Explore"));
    }

    #[test]
    fn get_agents_marks_user_agents_as_user_source() {
        let dir = tempdir().unwrap();
        let agent = Agent {
            name: "my-agent".into(), description: "d".into(), content: None,
            file_path: None, location: "user".into(), dependencies: None,
            source: "user".into(),
        };
        save_agent(dir.path(), &agent).unwrap();
        let agents = get_agents(dir.path()).unwrap();
        let mine = agents.iter().find(|a| a.name == "my-agent").unwrap();
        assert_eq!(mine.source, "user");
        assert!(agents.iter().any(|a| a.source == "builtin"));
    }

    #[test]
    fn save_and_delete_reject_builtin_names() {
        let dir = tempdir().unwrap();
        let agent = Agent {
            name: "general-purpose".into(), description: "x".into(), content: None,
            file_path: None, location: "user".into(), dependencies: None,
            source: "user".into(),
        };
        assert!(save_agent(dir.path(), &agent).is_err(), "saving over builtin must fail");
        assert!(delete_agent(dir.path(), "Explore").is_err(), "deleting builtin must fail");
    }
}
