#!/usr/bin/env bash
# nexterm-autopush — watches /docker/nexterm for file changes and auto-commits + pushes
# Managed by systemd: nexterm-autopush.service

set -euo pipefail

REPO="/docker/nexterm"
BRANCH="main"
DEBOUNCE=5   # seconds to wait after last change before committing

log() { echo "[$(date '+%H:%M:%S')] $*"; }

cd "$REPO"

# Ensure we have a clean starting state
git fetch origin "$BRANCH" --quiet 2>/dev/null || true

log "Watching $REPO for changes..."

while true; do
  # Wait for any change in tracked files (excluding .git and data/)
  inotifywait -r -e modify,create,delete,move \
    --exclude '(\.git|data|node_modules|\.log)' \
    "$REPO" -q 2>/dev/null

  # Debounce: wait for burst of changes to settle
  sleep "$DEBOUNCE"

  # Stage all changes
  git add -A

  # Skip if nothing changed
  if git diff --cached --quiet; then
    continue
  fi

  # Build a descriptive commit message
  CHANGED=$(git diff --cached --name-only | head -5 | tr '\n' ', ' | sed 's/,$//')
  COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 5 ]]; then
    MSG="chore: update ${COUNT} files"
  else
    MSG="chore: update ${CHANGED}"
  fi

  git commit -m "$MSG" --quiet
  git push origin "$BRANCH" --quiet

  log "Pushed: $MSG"
done
