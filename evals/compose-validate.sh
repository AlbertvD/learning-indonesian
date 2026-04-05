#!/usr/bin/env bash
# Eval: Compose Validation
# Validates docker-compose files: syntax check, hardcoded IPs, required labels, networks.

source "$(dirname "$0")/lib/common.sh"

eval_header "Compose File Validation"

CHANGED_FILES=$(get_changed_files "${1:-}")
COMPOSE_FILES=$(echo "$CHANGED_FILES" | grep -E 'compose\.(yml|yaml)$' || true)

if [ -z "$COMPOSE_FILES" ]; then
  if [ "${SCAN_ALL:-}" = "true" ]; then
    COMPOSE_FILES=$(find . -name 'docker-compose.yml' -o -name 'docker-compose.yaml' | sort)
  else
    eval_pass "No compose files changed"
    eval_exit
  fi
fi

BLOCKED_IPS_FILE="${BLOCKED_IPS_FILE:-$(dirname "$0")/lib/blocked-ips.txt}"
if [ -f "$BLOCKED_IPS_FILE" ]; then
  mapfile -t BLOCKED_IPS < <(grep -v '^#' "$BLOCKED_IPS_FILE" | grep -v '^$')
else
  BLOCKED_IPS=()
  eval_warn "No blocked-ips.txt found — skipping IP check"
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ -f "$file" ] || continue
  echo "Checking: $file"

  if command -v docker &>/dev/null; then
    if ! docker compose -f "$file" config --quiet 2>/dev/null; then
      eval_fail "Syntax error in $file"
    else
      eval_pass "Syntax OK: $file"
    fi
  elif command -v yq &>/dev/null; then
    if ! yq eval '.' "$file" >/dev/null 2>&1; then
      eval_fail "YAML syntax error in $file"
    else
      eval_pass "YAML syntax OK: $file"
    fi
  else
    eval_warn "Neither docker nor yq available — skipping syntax check for $file"
  fi

  for ip in "${BLOCKED_IPS[@]}"; do
    if grep -qF "$ip" "$file"; then
      eval_fail "Hardcoded IP $ip in $file — use DNS names (*.duin.home)"
    fi
  done

  # Bind-mount path check: Docker silently creates a directory if the host path doesn't exist.
  # Captures both absolute paths (/opt/...) and relative paths (./config/..., ../data/...).
  BIND_PATHS=$(grep -oP '(?<=- )[^:]+(?=:)' "$file" | grep -E '^(/|\./|\.\./)' || true)
  while IFS= read -r host_path; do
    [ -z "$host_path" ] && continue
    if [[ "$host_path" != *"\$"* ]] && [[ "${CI:-}" != "true" ]] && [ ! -e "$host_path" ]; then
      eval_warn "Bind-mount host path does not exist: $host_path in $file — Docker will create it as a directory"
    fi
  done <<< "$BIND_PATHS"

  if ! grep -q "restart:" "$file"; then
    eval_warn "No restart policy in $file — consider adding 'restart: unless-stopped'"
  fi

  if grep -q "environment:" "$file" && ! grep -q "TZ=" "$file"; then
    eval_warn "No TZ variable in $file — consider adding TZ=Europe/Amsterdam"
  fi
done <<< "$COMPOSE_FILES"

eval_exit
