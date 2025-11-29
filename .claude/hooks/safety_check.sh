#!/usr/bin/env python3
import json
import sys
import re

# 读取 stdin 中的 hook 数据
data = json.load(sys.stdin)
tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})

# 检查危险的 bash 命令
if tool_name == "Bash":
    command = tool_input.get("command", "")
    
    dangerous_patterns = [
        r"rm\\s+-rf\\s+/",           # 删除根目录
        r"rm\\s+-rf\\s+\\*",          # 删除所有文件
        r"dd\\s+if=/dev/zero",      # 清空磁盘
        r":\\(\\)\\{.*\\}",            # fork 炸弹
        r"mv\\s+/\\s+",              # 移动根目录
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, command):
            print(f"BLOCKED: 检测到危险命令: {pattern}", file=sys.stderr)
            print(f"命令内容: {command}", file=sys.stderr)
            sys.exit(2)  # exit code 2 会阻止执行

# 检查敏感文件修改
if tool_name in ["Write", "Edit"]:
    file_path = tool_input.get("file_path", "")
    
    sensitive_files = [
        ".env",
        "id_rsa",
        ".ssh/",
        "production.conf",
        "prod.yaml"
    ]
    
    for sensitive in sensitive_files:
        if sensitive in file_path:
            print(f"BLOCKED: 不能修改敏感文件: {file_path}", file=sys.stderr)
            print("请手动确认后再修改", file=sys.stderr)
            sys.exit(2)

# 没问题,放行
sys.exit(0)
