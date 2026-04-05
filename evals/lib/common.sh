#!/usr/bin/env bash
# Shared helpers for eval scripts
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

EXIT_PASS=0
EXIT_FAIL=1
EXIT_WARN=2

eval_pass() {
  echo -e "${GREEN}PASS${NC}: $1"
}

eval_fail() {
  echo -e "${RED}FAIL${NC}: $1"
  EVAL_FAILED=1
}

eval_warn() {
  echo -e "${YELLOW}WARN${NC}: $1"
}

eval_header() {
  echo ""
  echo -e "${YELLOW}--- $1 ---${NC}"
  echo ""
}

# Get changed files (works in CI with base branch, locally with HEAD)
get_changed_files() {
  local base="${1:-HEAD~1}"
  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    base="origin/${GITHUB_BASE_REF}"
  fi
  git diff --name-only --diff-filter=ACMR "$base" 2>/dev/null || true
}

EVAL_FAILED=0

eval_exit() {
  if [ "$EVAL_FAILED" -eq 1 ]; then
    echo ""
    echo -e "${RED}Eval failed. Fix the issues above before pushing.${NC}"
    exit $EXIT_FAIL
  fi
  echo ""
  echo -e "${GREEN}All checks passed.${NC}"
  exit $EXIT_PASS
}
