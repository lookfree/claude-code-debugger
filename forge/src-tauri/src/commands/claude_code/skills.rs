use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use crate::commands::claude_code::utils::safe_join;
use crate::config::atomic::write_atomic;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub location: String,
    pub dependencies: Option<Vec<String>>,
}

fn skills_dir(base_dir: &Path) -> PathBuf {
    base_dir.join("skills")
}

/// 解析单个 SKILL.md 为 Skill
fn parse_skill_md(skill_md: &Path, location: &str) -> Result<Skill, String> {
    let raw = fs::read_to_string(skill_md).map_err(|e| e.to_string())?;
    let dir_name = skill_md
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(Skill {
        name: extract_frontmatter_field(&raw, "name").unwrap_or(dir_name),
        description: extract_frontmatter_field(&raw, "description").unwrap_or_default(),
        content: Some(raw),
        file_path: Some(skill_md.to_string_lossy().to_string()),
        location: location.into(),
        dependencies: None,
    })
}

/// 插件技能：plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md
fn get_plugin_skills(base_dir: &Path) -> Vec<Skill> {
    let mut skills = vec![];
    let cache = base_dir.join("plugins/cache");
    let subdirs = |p: &Path| -> Vec<PathBuf> {
        fs::read_dir(p)
            .map(|rd| {
                rd.flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect()
            })
            .unwrap_or_default()
    };
    for marketplace in subdirs(&cache) {
        for plugin in subdirs(&marketplace) {
            for version in subdirs(&plugin) {
                for skill_dir in subdirs(&version.join("skills")) {
                    let skill_md = skill_dir.join("SKILL.md");
                    if skill_md.exists() {
                        if let Ok(skill) = parse_skill_md(&skill_md, "plugin") {
                            skills.push(skill);
                        }
                    }
                }
            }
        }
    }
    skills
}

pub fn get_skills(base_dir: &Path) -> Result<Vec<Skill>, String> {
    let mut skills = get_plugin_skills(base_dir);
    let dir = skills_dir(base_dir);
    if !dir.exists() { return Ok(skills); }
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            // Claude Code 标准格式：skills/<name>/SKILL.md
            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            let raw = fs::read_to_string(&skill_md).map_err(|e| e.to_string())?;
            let dir_name = path.file_name().unwrap().to_string_lossy().to_string();
            skills.push(Skill {
                name: extract_frontmatter_field(&raw, "name").unwrap_or(dir_name),
                description: extract_frontmatter_field(&raw, "description")
                    .unwrap_or_default(),
                content: Some(raw),
                file_path: Some(skill_md.to_string_lossy().to_string()),
                location: "user".into(),
                dependencies: None,
            });
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            // 兼容平铺 skills/<name>.md
            let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let name = path.file_stem().unwrap().to_string_lossy().to_string();
            skills.push(Skill {
                name,
                description: extract_frontmatter_field(&raw, "description")
                    .unwrap_or_default(),
                content: Some(raw),
                file_path: Some(path.to_string_lossy().to_string()),
                location: "user".into(),
                dependencies: None,
            });
        }
    }
    Ok(skills)
}

pub fn get_skill(base_dir: &Path, name: &str) -> Result<Option<Skill>, String> {
    Ok(get_skills(base_dir)?.into_iter().find(|s| s.name == name))
}

pub fn save_skill(base_dir: &Path, skill: &Skill) -> Result<(), String> {
    let dir = skills_dir(base_dir);
    let content = skill.content.clone().unwrap_or_else(|| {
        format!("---\nname: {}\ndescription: {}\n---\n", skill.name, skill.description)
    });
    let flat_path = safe_join(&dir, &format!("{}.md", skill.name))?;
    if flat_path.exists() {
        // 已存在的平铺技能就地更新
        return write_atomic(&flat_path, &content).map_err(|e| e.to_string());
    }
    // 默认采用 Claude Code 标准目录格式 skills/<name>/SKILL.md
    let skill_dir = safe_join(&dir, &skill.name)?;
    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    write_atomic(&skill_dir.join("SKILL.md"), &content).map_err(|e| e.to_string())
}

pub fn delete_skill(base_dir: &Path, name: &str) -> Result<(), String> {
    let dir = skills_dir(base_dir);
    let skill_dir = safe_join(&dir, name)?;
    if skill_dir.is_dir() && skill_dir.join("SKILL.md").exists() {
        fs::remove_dir_all(&skill_dir).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let flat_path = safe_join(&dir, &format!("{}.md", name))?;
    if flat_path.exists() {
        fs::remove_file(flat_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_frontmatter_field(content: &str, field: &str) -> Option<String> {
    let fm = content.strip_prefix("---\n")?.split("\n---").next()?;
    fm.lines()
        .find(|l| l.starts_with(&format!("{}:", field)))
        .map(|l| l[field.len() + 1..].trim().to_string())
}

fn resolve_base(base_dir: Option<String>) -> Result<PathBuf, String> {
    match base_dir {
        Some(d) => Ok(PathBuf::from(d)),
        None => dirs::home_dir()
            .map(|h| h.join(".claude"))
            .ok_or_else(|| "cannot determine home dir".into()),
    }
}

#[tauri::command]
pub fn cmd_get_skills(base_dir: Option<String>) -> Result<Vec<Skill>, String> {
    get_skills(&resolve_base(base_dir)?)
}
#[tauri::command]
pub fn cmd_get_skill(name: String, base_dir: Option<String>) -> Result<Option<Skill>, String> {
    get_skill(&resolve_base(base_dir)?, &name)
}
#[tauri::command]
pub fn cmd_save_skill(skill: Skill, base_dir: Option<String>) -> Result<(), String> {
    save_skill(&resolve_base(base_dir)?, &skill)
}
#[tauri::command]
pub fn cmd_delete_skill(name: String, base_dir: Option<String>) -> Result<(), String> {
    delete_skill(&resolve_base(base_dir)?, &name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn get_skills_empty_dir() {
        let dir = tempdir().unwrap();
        let base = dir.path().to_path_buf();
        let skills = get_skills(&base).unwrap();
        assert!(skills.is_empty());
    }

    #[test]
    fn save_and_get_skill_roundtrip() {
        let dir = tempdir().unwrap();
        let base = dir.path().to_path_buf();
        let skill = Skill {
            name: "test-skill".into(),
            description: "A test".into(),
            content: Some("---\ndescription: A test\n---\n# test".into()),
            file_path: None,
            location: "user".into(),
            dependencies: None,
        };
        save_skill(&base, &skill).unwrap();
        let loaded = get_skill(&base, "test-skill").unwrap().unwrap();
        assert_eq!(loaded.description, "A test");
    }

    #[test]
    fn delete_skill_removes_file() {
        let dir = tempdir().unwrap();
        let base = dir.path().to_path_buf();
        let skill = Skill {
            name: "to-delete".into(),
            description: "del".into(),
            content: None,
            file_path: None,
            location: "user".into(),
            dependencies: None,
        };
        save_skill(&base, &skill).unwrap();
        delete_skill(&base, "to-delete").unwrap();
        assert!(get_skill(&base, "to-delete").unwrap().is_none());
    }

    #[test]
    fn save_skill_rejects_traversal_in_name() {
        let dir = tempdir().unwrap();
        let skill = Skill {
            name: "../evil".into(),
            description: "bad".into(),
            content: None,
            file_path: None,
            location: "user".into(),
            dependencies: None,
        };
        let result = save_skill(dir.path(), &skill);
        assert!(result.is_err(), "expected Err for name '../evil'");
        assert!(!dir.path().parent().unwrap().join("evil.md").exists());
    }

    #[test]
    fn save_skill_rejects_absolute_name() {
        let dir = tempdir().unwrap();
        let skill = Skill {
            name: "/tmp/evil".into(),
            description: "bad".into(),
            content: None,
            file_path: None,
            location: "user".into(),
            dependencies: None,
        };
        let result = save_skill(dir.path(), &skill);
        assert!(result.is_err(), "expected Err for absolute name");
    }

    #[test]
    fn delete_skill_rejects_traversal_in_name() {
        let dir = tempdir().unwrap();
        let result = delete_skill(dir.path(), "../evil");
        assert!(result.is_err(), "expected Err for name '../evil'");
    }

    // 真实 Claude Code 技能格式：~/.claude/skills/<name>/SKILL.md
    #[test]
    fn get_skills_reads_directory_based_skills() {
        let dir = tempdir().unwrap();
        let skill_dir = dir.path().join("skills/my-dir-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: my-dir-skill\ndescription: dir based\n---\n# body",
        )
        .unwrap();
        let skills = get_skills(dir.path()).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-dir-skill");
        assert_eq!(skills[0].description, "dir based");
        assert!(skills[0].file_path.as_ref().unwrap().ends_with("SKILL.md"));
    }

    #[test]
    fn get_skills_dir_name_fallback_when_no_frontmatter_name() {
        let dir = tempdir().unwrap();
        let skill_dir = dir.path().join("skills/fallback-name");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "# no frontmatter").unwrap();
        let skills = get_skills(dir.path()).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "fallback-name");
    }

    #[test]
    fn get_skills_mixes_flat_and_directory_skills() {
        let dir = tempdir().unwrap();
        let skills_root = dir.path().join("skills");
        fs::create_dir_all(skills_root.join("dir-skill")).unwrap();
        fs::write(skills_root.join("dir-skill/SKILL.md"), "---\ndescription: d\n---\n").unwrap();
        fs::write(skills_root.join("flat-skill.md"), "---\ndescription: f\n---\n").unwrap();
        let mut names: Vec<String> =
            get_skills(dir.path()).unwrap().into_iter().map(|s| s.name).collect();
        names.sort();
        assert_eq!(names, vec!["dir-skill", "flat-skill"]);
    }

    #[test]
    fn get_skills_includes_plugin_skills() {
        // 插件技能：plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md
        let dir = tempdir().unwrap();
        let plugin_skill = dir
            .path()
            .join("plugins/cache/official/superpowers/1.0.0/skills/tdd");
        fs::create_dir_all(&plugin_skill).unwrap();
        fs::write(
            plugin_skill.join("SKILL.md"),
            "---\nname: tdd\ndescription: plugin skill\n---\n",
        )
        .unwrap();
        let skills = get_skills(dir.path()).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "tdd");
        assert_eq!(skills[0].location, "plugin");
    }

    #[test]
    fn save_skill_writes_directory_layout_and_delete_removes_dir() {
        let dir = tempdir().unwrap();
        let skill = Skill {
            name: "new-skill".into(),
            description: "n".into(),
            content: Some("---\nname: new-skill\ndescription: n\n---\n".into()),
            file_path: None,
            location: "user".into(),
            dependencies: None,
        };
        save_skill(dir.path(), &skill).unwrap();
        assert!(dir.path().join("skills/new-skill/SKILL.md").exists());
        delete_skill(dir.path(), "new-skill").unwrap();
        assert!(!dir.path().join("skills/new-skill").exists());
    }
}
