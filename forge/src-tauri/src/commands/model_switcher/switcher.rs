use serde::Serialize;
use serde_json::Value;
use std::path::Path;

use crate::config::{claude, codex};

#[derive(Debug, Clone, Serialize)]
pub struct SwitchResult {
    pub tool: String,
    pub success: bool,
    pub hot_reload: bool,
    pub error: Option<String>,
}

/// 核心切换函数：接收显式路径（便于测试使用 tempfile）
/// claude_code_config / codex_cli_config 是从 Provider.claude_code_config 解析出的 JSON 片段字符串
pub fn switch_provider_with_paths(
    claude_code_path: Option<&Path>,
    codex_cli_path: Option<&Path>,
    claude_code_fragment: Option<&str>,
    codex_cli_fragment: Option<&str>,
    targets: &[String],
) -> Vec<SwitchResult> {
    let mut results = Vec::new();

    for target in targets {
        match target.as_str() {
            "claude-code" => {
                let (fragment, path) = match (claude_code_fragment, claude_code_path) {
                    (Some(f), Some(p)) => (f, p),
                    _ => continue, // 该工具没有配置片段 → 跳过
                };
                let res = (|| -> Result<(), String> {
                    let updates: Value =
                        serde_json::from_str(fragment).map_err(|e| e.to_string())?;
                    claude::merge_fields(path, &updates)
                })();
                results.push(SwitchResult {
                    tool: "claude-code".to_string(),
                    success: res.is_ok(),
                    hot_reload: true,
                    error: res.err(),
                });
            }
            "codex-cli" => {
                let (fragment, path) = match (codex_cli_fragment, codex_cli_path) {
                    (Some(f), Some(p)) => (f, p),
                    _ => continue,
                };
                let res = (|| -> Result<(), String> {
                    let updates: toml::Table =
                        toml::from_str(
                            // fragment 是 JSON；将 JSON object 转为 TOML key=value 字符串
                            &json_fragment_to_toml(fragment)?,
                        )
                        .map_err(|e| e.to_string())?;
                    codex::merge_fields(path, &updates)
                })();
                results.push(SwitchResult {
                    tool: "codex-cli".to_string(),
                    success: res.is_ok(),
                    hot_reload: false,
                    error: res.err(),
                });
            }
            _ => {} // 未知工具忽略
        }
    }
    results
}

/// 将 JSON object 片段（如 `{"model":"gpt-4o","provider":"openai"}`）
/// 转换为 TOML 字符串（如 `model = "gpt-4o"\nprovider = "openai"\n`）
/// 仅支持顶层 string / number / bool 值（Provider 片段足够使用）
fn json_fragment_to_toml(fragment: &str) -> Result<String, String> {
    let v: Value = serde_json::from_str(fragment).map_err(|e| e.to_string())?;
    let obj = v.as_object().ok_or("fragment must be a JSON object")?;
    let mut out = String::new();
    for (k, val) in obj {
        match val {
            Value::String(s) => out.push_str(&format!("{} = {}\n", k, toml::Value::String(s.clone()))),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    out.push_str(&format!("{} = {}\n", k, i));
                } else if let Some(f) = n.as_f64() {
                    out.push_str(&format!("{} = {}\n", k, f));
                }
            }
            Value::Bool(b) => out.push_str(&format!("{} = {}\n", k, b)),
            _ => {} // 嵌套对象/数组暂不支持（Provider 片段不需要）
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(s: &str) -> Vec<String> {
        vec![s.to_string()]
    }
    fn targets_both() -> Vec<String> {
        vec!["claude-code".to_string(), "codex-cli".to_string()]
    }

    #[test]
    fn switch_claude_code_writes_model_field() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("claude.json");

        let results = switch_provider_with_paths(
            Some(&path),
            None,
            Some(r#"{"model":"claude-opus-4"}"#),
            None,
            &target("claude-code"),
        );

        assert_eq!(results.len(), 1);
        assert!(results[0].success, "expected success, got: {:?}", results[0].error);
        assert!(results[0].hot_reload);

        // Verify the file was written
        let written = std::fs::read_to_string(&path).unwrap();
        let v: Value = serde_json::from_str(&written).unwrap();
        assert_eq!(v["model"], "claude-opus-4");
    }

    #[test]
    fn switch_codex_cli_writes_model_and_provider() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        let results = switch_provider_with_paths(
            None,
            Some(&path),
            None,
            Some(r#"{"model":"gpt-4o","provider":"openai"}"#),
            &target("codex-cli"),
        );

        assert_eq!(results.len(), 1);
        assert!(results[0].success);
        assert!(!results[0].hot_reload); // codex requires restart

        let written = std::fs::read_to_string(&path).unwrap();
        let doc: toml::Table = toml::from_str(&written).unwrap();
        assert_eq!(doc["model"].as_str(), Some("gpt-4o"));
        assert_eq!(doc["provider"].as_str(), Some("openai"));
    }

    #[test]
    fn switch_both_tools() {
        let dir = tempfile::tempdir().unwrap();
        let claude_path = dir.path().join("claude.json");
        let codex_path = dir.path().join("config.toml");

        let results = switch_provider_with_paths(
            Some(&claude_path),
            Some(&codex_path),
            Some(r#"{"model":"claude-sonnet-4-5"}"#),
            Some(r#"{"model":"claude-sonnet-4-5","provider":"anthropic"}"#),
            &targets_both(),
        );

        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.success));
    }

    #[test]
    fn switch_skips_tool_not_in_targets() {
        let dir = tempfile::tempdir().unwrap();
        let claude_path = dir.path().join("claude.json");

        // Only target codex-cli, but no codex fragment — codex result not included
        let results = switch_provider_with_paths(
            Some(&claude_path),
            None,
            Some(r#"{"model":"claude-haiku-4-5"}"#),
            None,
            &target("codex-cli"),  // target codex but no codex path / fragment
        );

        // codex-cli: fragment is None → skip (no config to write)
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn switch_returns_error_on_invalid_json_fragment() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("claude.json");

        let results = switch_provider_with_paths(
            Some(&path),
            None,
            Some("{invalid json"),
            None,
            &target("claude-code"),
        );

        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(results[0].error.is_some());
    }

    #[test]
    fn switch_returns_error_when_target_path_is_directory() {
        // If the config path is a directory (not a file), the write must fail and
        // success must be false — so the caller (switch_provider command) must NOT
        // update active_providers for that tool.
        let dir = tempfile::tempdir().unwrap();
        // Use the directory itself as the "file" path — writing to a directory fails.
        let bad_path = dir.path().to_path_buf();

        let results = switch_provider_with_paths(
            Some(&bad_path),
            None,
            Some(r#"{"model":"claude-opus-4"}"#),
            None,
            &target("claude-code"),
        );

        assert_eq!(results.len(), 1);
        assert!(!results[0].success, "write to a directory must fail");
        assert!(results[0].error.is_some(), "error message must be present");
    }

    #[test]
    fn switch_preserves_existing_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("claude.json");
        // Pre-populate with a "future" field that Forge doesn't know about
        std::fs::write(&path, r#"{"apiKey":"sk-xxx","futureField":42}"#).unwrap();

        switch_provider_with_paths(
            Some(&path),
            None,
            Some(r#"{"model":"claude-opus-4"}"#),
            None,
            &target("claude-code"),
        );

        let v: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["futureField"], 42, "unknown field should be preserved");
        assert_eq!(v["model"], "claude-opus-4");
    }
}
