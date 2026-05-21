#!/usr/bin/env bash
# Eval: Staged Set Check
# Blocks commits with two suspicious shapes:
#   1. Mixed docs (*.md) and code (*.ts, *.tsx, *.sql) — splits should be separate commits.
#   2. >10 files staged — easy to lose track of intended scope when commits get this large.
#
# Escape hatches (set in environment before `git commit`):
#   ALLOW_MIXED_COMMIT=1 — bypass the mixed-docs-and-code check.
#   ALLOW_LARGE_COMMIT=1 — bypass the file-count check.
#
# Rationale: 2026-05-21 incident where a commit titled "docs: ..." actually shipped
# 6 in-flight code files from a concurrent agent's PR. See CLAUDE.md "Quality Over
# Speed" §git stat check rule, and ~/.claude/projects/.../memory/feedback_staging_discipline.md.

source "$(dirname "$0")/lib/common.sh"

eval_header "Staged Set Check"

STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || echo "")

if [ -z "$STAGED" ]; then
  eval_pass "No staged files to scan"
  eval_exit
fi

# ── Check 1: mixed docs + code ────────────────────────────────────────────
HAS_DOCS=0
HAS_CODE=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.md) HAS_DOCS=1 ;;
    *.ts|*.tsx|*.sql|*.js|*.jsx) HAS_CODE=1 ;;
  esac
done <<< "$STAGED"

if [ "$HAS_DOCS" -eq 1 ] && [ "$HAS_CODE" -eq 1 ]; then
  if [ "${ALLOW_MIXED_COMMIT:-0}" = "1" ]; then
    eval_warn "Mixed docs (*.md) + code commit allowed via ALLOW_MIXED_COMMIT=1"
  else
    eval_fail "Mixed docs (*.md) + code commit detected. Staged files:"
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      echo "    $f"
    done <<< "$STAGED"
    echo ""
    echo "    Split into two commits, OR set ALLOW_MIXED_COMMIT=1 if the docs and code"
    echo "    edits genuinely belong together (e.g. implementation + matching module spec)."
    echo "    To recover the staging area: \`git reset\` then re-stage selectively."
  fi
fi

# ── Check 2: large file count ─────────────────────────────────────────────
COUNT=$(echo "$STAGED" | grep -cv '^$' || echo "0")
THRESHOLD=10

if [ "$COUNT" -gt "$THRESHOLD" ]; then
  if [ "${ALLOW_LARGE_COMMIT:-0}" = "1" ]; then
    eval_warn "Large commit ($COUNT files) allowed via ALLOW_LARGE_COMMIT=1"
  else
    eval_fail "Staged set has $COUNT files (threshold: $THRESHOLD). Run \`git diff --cached --stat\` to verify scope, then set ALLOW_LARGE_COMMIT=1 if intentional."
  fi
fi

if [ "$EVAL_FAILED" -eq 0 ]; then
  eval_pass "Staged set ($COUNT files) within thresholds"
fi

eval_exit
