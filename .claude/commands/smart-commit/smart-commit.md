---
description: 使用暂存更改生成约定式提交
---

# 智能Git提交

## 上下文分析
- 当前git状态：!`git status --porcelain`
- 暂存的更改：!`git diff --cached --name-only`
- 最近的提交：!`git log --oneline -5`

## 你的任务
1. 分析暂存的更改以了解修改了什么
2. 生成约定式提交消息（feat, fix, docs等）
3. 使消息具有描述性但简洁
4. 使用生成的消息执行提交
5. 显示提交哈希和摘要
6. 最后直接push到git