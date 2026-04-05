#!/usr/bin/env bash
# Eval: Lesson Check
source "$(dirname "$0")/lib/common.sh"
eval_header "OpenBrain Lesson Check"
OPENBRAIN_URL="${OPENBRAIN_URL:-}"
OPENBRAIN_KEY="${OPENBRAIN_KEY:-}"
if [ -z "$OPENBRAIN_KEY" ] || [ -z "$OPENBRAIN_URL" ]; then
  eval_warn "OPENBRAIN_URL or OPENBRAIN_KEY not set — skipping lesson check"
  eval_exit
fi
CHANGED_FILES=$(get_changed_files "${1:-}")
SERVICES_PATH="${SERVICES_PATH:-services}"
STACKS=$(echo "$CHANGED_FILES" | grep -oP "${SERVICES_PATH}/\K[^/]+" | sort -u || true)
if [ -z "$STACKS" ]; then
  eval_pass "No service changes detected — no lessons to check"
  eval_exit
fi
for stack in $STACKS; do
  echo "Checking lessons for stack: $stack"

  # Build JSON payload via python3 to safely encode $stack.
  # Direct bash interpolation into JSON breaks on special characters (quotes, backslashes).
  PAYLOAD=$(python3 -c "
import json, sys
stack = sys.argv[1]
payload = {
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'tools/call',
    'params': {
        'name': 'search_deployment_lessons',
        'arguments': {'stack': stack, 'limit': 10}
    }
}
print(json.dumps(payload))
" "$stack" 2>/dev/null)

  RESPONSE=$(curl -s --fail-with-body -X POST "$OPENBRAIN_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "x-brain-key: $OPENBRAIN_KEY" \
    -d "$PAYLOAD" \
    2>/dev/null || echo "{}")
  if [ "$RESPONSE" = "{}" ]; then
    eval_warn "OpenBrain unreachable for stack $stack — skipping lesson check"
    continue
  fi
  LESSONS=$(echo "$RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    content = data.get('result', {}).get('content', [])
    for item in content:
        text = item.get('text', '')
        if text:
            lessons = json.loads(text) if text.startswith('[') else [json.loads(text)] if text.startswith('{') else []
            for l in lessons:
                sev = l.get('severity', 'info')
                lesson = l.get('lesson', '')
                guardrail = l.get('guardrail', '')
                eval_assertion = l.get('eval_assertion', '')
                print(f'{sev}|{lesson}|{guardrail}|{eval_assertion}')
except Exception as e:
    import sys as _sys; print(f'WARN: lesson parse error: {e}', file=_sys.stderr)
" 2>/dev/null || true)
  if [ -z "$LESSONS" ]; then
    eval_pass "No lessons found for $stack"
    continue
  fi
  while IFS='|' read -r severity lesson guardrail eval_assertion; do
    case "$severity" in
      outage)
        echo -e "${RED}[OUTAGE LESSON — READ BEFORE PUSHING]${NC}"
        eval_warn "[OUTAGE] $lesson"
        [ -n "$guardrail" ] && echo "    Guardrail: $guardrail"
        [ -n "$eval_assertion" ] && echo "    Eval assertion: $eval_assertion"
        ;;
      bug)
        eval_warn "[BUG] $lesson"
        [ -n "$guardrail" ] && echo "    Guardrail: $guardrail"
        ;;
      friction|optimization)
        echo "  [$severity] $lesson"
        ;;
    esac
done <<< "$LESSONS"
done
eval_exit
