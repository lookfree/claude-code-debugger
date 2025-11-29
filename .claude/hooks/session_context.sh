#!/bin/bash
echo "=== Project Context ==="
echo "## Git Status"
git branch --show-current && git status --short
echo ""
echo "## Recent Commits (last 5)"
git log --oneline -5
echo ""
if command -v gh &> /dev/null; then
  echo "## Your Open Issues"
  gh issue list --assignee @me --limit 5
fi
