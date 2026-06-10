// forge/src-tauri/src/commands/usage/parser.rs
use std::path::Path;

/// 单条已解析会话（聚合自一个 .jsonl 文件）
#[derive(Debug, Clone)]
pub struct ParsedSession {
    pub session_id: String,
    pub working_dir: String,
    pub started_at: Option<i64>,   // Unix 秒
    pub ended_at: Option<i64>,
    pub model: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: f64,
    pub source_path: String,       // .jsonl 绝对路径
}

/// 定价表 (model_id, input_per_1k_usd, output_per_1k_usd)
const PRICING: &[(&str, f64, f64)] = &[
    ("claude-sonnet-4-5", 0.003, 0.015),
    ("claude-sonnet-4-7", 0.003, 0.015),
    ("claude-fable-5",    0.003, 0.015), // 按 sonnet 级别估算
    ("claude-opus-4",     0.015, 0.075),
    ("claude-haiku-4-5",  0.0008, 0.004),
    ("gpt-4o",            0.005,  0.015),
    ("gpt-4o-mini",       0.00015, 0.0006),
];

pub fn estimate_cost(model: &str, input_tokens: i64, output_tokens: i64) -> f64 {
    todo!()
}

/// 解析一个 .jsonl 文件，返回 ParsedSession；失败时返回 Err
pub fn parse_session_file(path: &Path) -> Result<ParsedSession, String> {
    todo!()
}

/// 遍历 base_dir（如 ~/.claude/projects）下的所有 .jsonl 文件
pub fn walk_claude_sessions(base_dir: &Path) -> Vec<ParsedSession> {
    todo!()
}
