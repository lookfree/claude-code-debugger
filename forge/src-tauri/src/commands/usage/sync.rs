// forge/src-tauri/src/commands/usage/sync.rs

/// 解析 Claude 会话 + 写入 DB；返回同步的会话数
#[tauri::command]
pub fn usage_sync(db: tauri::State<'_, crate::commands::model_switcher::commands::DbState>)
    -> Result<usize, String>
{
    todo!()
}
