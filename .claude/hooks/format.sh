#!/bin/bash

for file in $CLAUDE_FILE_PATHS; do
  case "$file" in
    *.js|*.jsx|*.ts|*.tsx)
      prettier --write "$file" 2>/dev/null || true
      ;;
    *.py)
      black "$file" 2>/dev/null || true
      ;;
    *.go)
      gofmt -w "$file" 2>/dev/null || true
      ;;
    *.java)
      google-java-format -i "$file" 2>/dev/null || true
      ;;
  esac
done