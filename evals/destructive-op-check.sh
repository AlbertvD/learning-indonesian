#!/usr/bin/env bash
# Eval: Destructive Operation Check
# Scans diffs for dangerous patterns that could destroy data or services.
# Fails loudly — never silently.

source "$(dirname "$0")/lib/common.sh"

eval_header "Destructive Operation Check"

DIFF=$(git diff --cached --diff-filter=ACMR 2>/dev/null || git diff HEAD~1 --diff-filter=ACMR 2>/dev/null || echo "")

if [ -z "$DIFF" ]; then
  eval_pass "No diff to scan"
  eval_exit
fi

ADDED_LINES=$(echo "$DIFF" | grep '^+' | grep -v '^+++' || true)

check_pattern() {
  local pattern="$1"
  local reason="$2"
  local matches
  matches=$(echo "$ADDED_LINES" | grep -n "$pattern" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    eval_fail "$reason"
    echo "  Pattern: $pattern"
    echo "$matches" | head -3 | sed 's/^/    /'
  fi
}

check_pattern "rm -rf /" "Recursive force delete from root — catastrophic data loss"
check_pattern "DROP TABLE" "SQL table drop — irreversible data loss"
check_pattern "DROP DATABASE" "SQL database drop — irreversible data loss"
check_pattern "TRUNCATE TABLE" "SQL table truncate — all data lost"
check_pattern "^+[[:space:]]*TRUNCATE [a-zA-Z]" "SQL table truncate (bare form) — all data lost"
check_pattern "docker system prune -a" "Docker full prune — removes all unused images/volumes"
check_pattern "docker volume rm" "Docker volume removal — persistent data lost"
check_pattern "docker volume prune" "Docker volume prune — unused volumes deleted"
check_pattern "git push.*(main|master).*--force" "Force push to main/master — rewrites protected branch history"
# Note: tag force-pushes (git push origin v1 --force) are intentionally allowed —
# homelab-platform uses a floating v1 tag. Only main/master force-pushes are blocked.
check_pattern "mkfs\." "Filesystem format — destroys all data on device"
check_pattern "dd if=.*of=/dev" "Raw disk write — overwrites device data"

ENV_DEPENDENT=$(echo "$ADDED_LINES" | grep -iE '(delete.*from|drop|truncate|destroy|purge)' | grep -viE '(test|mock|fixture|migration)' || true)
if [ -n "$ENV_DEPENDENT" ]; then
  eval_warn "Environment-dependent destructive operations detected — verify these target staging, not production:"
  echo "$ENV_DEPENDENT" | head -5 | sed 's/^/    /'
fi

if [ "$EVAL_FAILED" -eq 0 ]; then
  eval_pass "No destructive operations detected"
fi

eval_exit
