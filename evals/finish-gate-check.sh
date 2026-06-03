#!/usr/bin/env bash
# Eval: Finish Gate — mandatory lesson sweep + PR-1 data-model verification.
#
# Fires in .husky/pre-push (a push precedes PR creation). Blocks the push — and
# therefore the PR — unless the Finish phase of the dev-workflow loop is honoured
# (see docs/process/dev-workflow.md + docs/process/openbrain-recall-capture.md):
#
#   (a) A lesson was captured for the branch — a `Dev-Workflow-Lesson: <id|none>`
#       trailer on a commit since the base branch. Use `none` to explicitly mark
#       "nothing worth keeping" (the issue's explicit-skip path).
#   (b) For data-model work (the branch touches scripts/migration.sql) the PR-1
#       verification was asserted — a `Dev-Workflow-DB-Verified: <evidence>`
#       trailer (plan-vs-actual diff + live-DB completeness query). The hook
#       asserts the verification *ran*; it cannot know each plan's invariants and
#       CI cannot reach the homelab DB, so the evidence is a trailer, not a query.
#
# Non-data-model branches only need the lesson trailer — they are not over-gated.
# WIP / intermediate pushes:  SKIP_FINISH_GATE=1 git push
#
source "$(dirname "$0")/lib/common.sh"
eval_header "Finish Gate — lesson sweep + data-model verification"

# WIP escape hatch (matches the ALLOW_*_COMMIT idiom in .husky/pre-commit).
if [ "${SKIP_FINISH_GATE:-0}" = "1" ]; then
  eval_warn "SKIP_FINISH_GATE=1 — finish gate bypassed for this push (WIP)."
  eval_exit
fi

# Never gate the default branch itself.
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ] || [ "$BRANCH" = "HEAD" ]; then
  eval_pass "On '$BRANCH' — the finish gate applies to feature branches only."
  eval_exit
fi

# Base = merge-base with the default branch (prefer origin/main, then local).
BASE=""
for ref in origin/main main origin/master master; do
  if git rev-parse --verify --quiet "$ref" >/dev/null; then
    BASE="$(git merge-base HEAD "$ref" 2>/dev/null || true)"
    [ -n "$BASE" ] && break
  fi
done
if [ -z "$BASE" ]; then
  eval_warn "Could not resolve a base branch (origin/main, main, …) — skipping finish gate."
  eval_exit
fi

RANGE="$BASE..HEAD"
if [ "$(git rev-list --count "$RANGE" 2>/dev/null || echo 0)" = "0" ]; then
  eval_pass "No commits ahead of the base branch — nothing to finish-gate."
  eval_exit
fi

# Commit bodies in the range, for trailer scanning.
LOG_BODIES="$(git log --format='%B' "$RANGE" 2>/dev/null || true)"

# (a) Lesson-capture trailer ----------------------------------------------------
LESSON_TRAILER="$(printf '%s\n' "$LOG_BODIES" | grep -iE '^Dev-Workflow-Lesson:[[:space:]]*[^[:space:]]' || true)"
if [ -z "$LESSON_TRAILER" ]; then
  eval_fail "No lesson captured for branch '$BRANCH'."
  cat <<'EOF'
    The Finish phase requires a captured lesson (or an explicit "none").
    Capture per docs/process/openbrain-recall-capture.md, then record it as a
    commit trailer:

        Dev-Workflow-Lesson: <openbrain-lesson-id>     # a real lesson
        Dev-Workflow-Lesson: none                      # nothing worth keeping

    Add it to the latest commit:
        git commit --amend --trailer "Dev-Workflow-Lesson: <id|none>"
    Bypass for a WIP push:
        SKIP_FINISH_GATE=1 git push
EOF
else
  VALUE="$(printf '%s\n' "$LESSON_TRAILER" | sed -E 's/^[^:]*:[[:space:]]*//' | paste -sd ',' - )"
  eval_pass "Lesson trailer present: $VALUE"
fi

# (b) Data-model scoping — PR-1 verification only when schema is touched --------
CHANGED="$(git diff --name-only "$RANGE" 2>/dev/null || true)"
if printf '%s\n' "$CHANGED" | grep -qE '(^|/)scripts/migration\.sql$'; then
  echo "  Data-model change detected (scripts/migration.sql touched)."
  DB_TRAILER="$(printf '%s\n' "$LOG_BODIES" | grep -iE '^Dev-Workflow-DB-Verified:[[:space:]]*[^[:space:]]' || true)"
  if [ -z "$DB_TRAILER" ]; then
    eval_fail "Schema changed but the PR-1 verification was not asserted for branch '$BRANCH'."
    cat <<'EOF'
    Data-model branches must run the PR-1 verification before finishing:
      1. Plan-vs-actual diff:  git show --stat <range>  — cross-check against the
                               plan's promised changes (PR #1's outage slipped past
                               architect review for lack of this step).
      2. Live-DB completeness: make check-supabase-deep  + the plan-specific
                               completeness query (count the invariant the plan
                               promised; expect 0 violations).
    Then assert it as a commit trailer:

        Dev-Workflow-DB-Verified: <date> <one-line evidence, e.g. "HC13=0, plan matches">

    Add it:
        git commit --amend --trailer "Dev-Workflow-DB-Verified: $(date +%F) <evidence>"
EOF
  else
    DBVAL="$(printf '%s\n' "$DB_TRAILER" | sed -E 's/^[^:]*:[[:space:]]*//' | paste -sd ',' - )"
    eval_pass "PR-1 verification asserted: $DBVAL"
  fi
else
  eval_pass "No data-model change (scripts/migration.sql untouched) — DB verification not required."
fi

eval_exit
