#!/usr/bin/env bash
# Lesson Capture: Automatically records CI failures to OpenBrain.
source "$(dirname "$0")/lib/common.sh"
STACK="${1:?Usage: lesson-capture.sh <stack> <category> <severity> <description>}"
CATEGORY="${2:-ci}"
SEVERITY="${3:-friction}"
DESCRIPTION="${4:-CI failure (no description provided)}"
OPENBRAIN_URL="${OPENBRAIN_URL:-}"
OPENBRAIN_KEY="${OPENBRAIN_KEY:-}"
if [ -z "$OPENBRAIN_KEY" ] || [ -z "$OPENBRAIN_URL" ]; then
  echo "OPENBRAIN_URL or OPENBRAIN_KEY not set — cannot capture lesson"
  exit 0
fi
BRANCH="${GITHUB_REF_NAME:-local}"
COMMIT="${GITHUB_SHA:-unknown}"
COMMIT_SHORT="${COMMIT:0:7}"
WORKFLOW="${GITHUB_WORKFLOW:-manual}"
LESSON="[CI] $DESCRIPTION (branch: $BRANCH, commit: $COMMIT_SHORT, workflow: $WORKFLOW)"

# Build JSON payload via python3 to safely encode all fields.
# Direct bash interpolation breaks on special characters in $LESSON (quotes, parens, etc).
PAYLOAD=$(python3 -c "
import json, sys
payload = {
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'tools/call',
    'params': {
        'name': 'add_deployment_lesson',
        'arguments': {
            'stack': sys.argv[1],
            'category': sys.argv[2],
            'severity': sys.argv[3],
            'lesson': sys.argv[4]
        }
    }
}
print(json.dumps(payload))
" "$STACK" "$CATEGORY" "$SEVERITY" "$LESSON" 2>/dev/null)

CAPTURE_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$OPENBRAIN_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "x-brain-key: $OPENBRAIN_KEY" \
  -d "$PAYLOAD" \
  2>/dev/null || echo "000")
if [ "$CAPTURE_RESULT" = "200" ]; then
  echo "Lesson captured to OpenBrain: $LESSON"
else
  echo "Warning: OpenBrain capture returned HTTP $CAPTURE_RESULT — lesson not saved"
fi
exit 0
