#!/usr/bin/env bash
# Eval: RLS Policy Check
source "$(dirname "$0")/lib/common.sh"
eval_header "RLS Policy Check"
OPENBRAIN_URL="${OPENBRAIN_URL:-}"
OPENBRAIN_KEY="${OPENBRAIN_KEY:-}"
CHANGED_FILES=$(get_changed_files "${1:-}")
MIGRATION_FILES=$(echo "$CHANGED_FILES" | grep -E "supabase/migrations/.*\.sql$" || true)
if [ -z "$MIGRATION_FILES" ]; then eval_pass "No migration files changed — no RLS check needed"; eval_exit; fi
CHANGED_TABLES=$(echo "$MIGRATION_FILES" | while IFS= read -r mf; do [ -f "$mf" ] && grep -oiP "(?<=CREATE TABLE (?:IF NOT EXISTS )?)[a-zA-Z_][a-zA-Z0-9_.]*" "$mf" 2>/dev/null || true; done | sort -u)
if [ -z "$CHANGED_TABLES" ]; then eval_pass "No CREATE TABLE statements in changed migration files — no RLS check needed"; eval_exit; fi
while IFS= read -r table; do
  [ -z "$table" ] && continue; bare_table="${table##*.}"; RLS_FOUND=false
  while IFS= read -r mf; do
    [ -f "$mf" ] || continue
    if grep -qiP "ALTER\s+TABLE[^;]*\b${bare_table}\b[^;]*ENABLE\s+ROW\s+LEVEL\s+SECURITY" "$mf" 2>/dev/null; then RLS_FOUND=true; break; fi
  done <<< "$MIGRATION_FILES"
  if $RLS_FOUND; then eval_pass "ENABLE ROW LEVEL SECURITY found for '$bare_table'"; else eval_warn "No 'ENABLE ROW LEVEL SECURITY' for '$bare_table' — add: ALTER TABLE $bare_table ENABLE ROW LEVEL SECURITY;"; fi
done <<< "$CHANGED_TABLES"
if [ -n "$OPENBRAIN_KEY" ] && [ -n "$OPENBRAIN_URL" ]; then
  NEW_TABLES=$(echo "$MIGRATION_FILES" | while IFS= read -r mf; do [ -f "$mf" ] && grep -oiP "(?<=CREATE TABLE (?:IF NOT EXISTS )?)[a-zA-Z_][a-zA-Z0-9_.]*" "$mf" 2>/dev/null || true; done | sort -u)
  for schema in public auth extensions; do
    RESPONSE=$(curl -s --fail-with-body -X POST "$OPENBRAIN_URL/mcp" -H "Content-Type: application/json" -H "x-brain-key: $OPENBRAIN_KEY" -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/call\", \"params\": {\"name\": \"list_rls_policies\", \"arguments\": {\"schema\": \"$schema\"}}}" 2>/dev/null || echo "{}")
    TABLES_WITH_POLICIES=$(echo "$RESPONSE" | python3 -c "import json, sys; data=json.load(sys.stdin); content=data.get('result', {}).get('content', [{}])[0].get('text', '[]'); policies=json.loads(content) if content.startswith('[') else []; tables={p.get('table') for p in policies if p.get('table')}; print(','.join(sorted(tables)))" 2>/dev/null || true)
    while IFS= read -r table; do
      [ -z "$table" ] && continue; bare_table="${table##*.}"; if echo "$NEW_TABLES" | grep -qw "$bare_table"; then continue; fi
      if ! echo "$TABLES_WITH_POLICIES" | grep -qw "$bare_table"; then eval_warn "No SELECT policy for '$schema.$bare_table' (existing table) — RLS enabled but no policy = empty results for all users"; fi
    done <<< "$CHANGED_TABLES"
  done
else eval_warn "OPENBRAIN_URL or OPENBRAIN_KEY not set — skipping SELECT policy check for existing tables (primary RLS check above still ran)"; fi
eval_exit
