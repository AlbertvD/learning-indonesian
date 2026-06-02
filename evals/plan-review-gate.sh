#!/usr/bin/env bash
# Eval: Plan Review Gate
#
# A docs/plans/*.md that reaches `status: approved` AND touches the data model
# (schema / typed content tables / a writer-reader-validator contract) must carry
# BOTH `architect` and `data-architect` in its `reviewed_by:` frontmatter.
#
# Why: 2026-06-02 — a CS19 gate aimed at the wrong column (`item_meanings` vs the
# live `translation_nl`) passed two architect rounds; only the data-architect's
# writer/reader/validator pass caught it. Architect sign-off alone is not
# review-complete for data-model specs. This gate enforces what CLAUDE.md states,
# so a forgetful session physically cannot land a single-reviewed data-model plan.
source "$(dirname "$0")/lib/common.sh"
eval_header "Plan Review Gate"

# Pre-commit: gate what is about to land (staged), not HEAD~1.
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
PLANS=$(echo "$STAGED" | grep -E '^docs/plans/.*\.md$' || true)
if [ -z "$PLANS" ]; then
  eval_pass "No docs/plans/*.md staged — gate not applicable"
  eval_exit
fi

# Data-model surface signature: schema/migration words, the typed content tables,
# and the writer/reader/validator contract phrase.
DM_RE='migration|schema|CHECK constraint|\bRLS\b|retired_at|writer.?reader.?validator|\b(learning_items|translation_nl|translation_en|item_meanings|item_answer_variants|capability_artifacts|learning_capabilities|exercise_variants|grammar_patterns|lesson_sections|lesson_dialogue_lines|lesson_section_item_rows)\b'

while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  base="$(basename "$f")"

  # Only gate APPROVED plans — drafts iterate freely.
  if ! grep -qE '^status:[[:space:]]*approved' "$f"; then
    eval_pass "$base: not status:approved — skipped"
    continue
  fi

  # Only gate data-model-touching plans — pure UI/process plans need only architect.
  if ! grep -qiE "$DM_RE" "$f"; then
    eval_pass "$base: approved, no data-model surface — architect-only OK"
    continue
  fi

  # Extract the YAML frontmatter (between the first two '---' lines).
  fm="$(awk 'BEGIN{c=0} /^---[[:space:]]*$/{c++; next} c==1{print} c>=2{exit}' "$f")"

  # data-architect must be present in reviewed_by.
  has_data=0
  echo "$fm" | grep -qiE 'data-architect' && has_data=1
  # A standalone architect entry: "architect" preceded by start/space/paren, NOT "data-".
  has_arch=0
  echo "$fm" | grep -qiE '(^|[^a-z-])architect' && has_arch=1

  if [ "$has_data" -eq 1 ] && [ "$has_arch" -eq 1 ]; then
    eval_pass "$base: approved data-model plan carries architect + data-architect"
  else
    missing="data-architect"
    [ "$has_arch" -eq 0 ] && missing="architect + data-architect"
    eval_fail "$base: approved plan touches the data model but reviewed_by is missing $missing. A schema / typed-table / writer-reader-validator spec needs BOTH architect AND data-architect sign-off (CLAUDE.md → Quality Over Speed). Run the data-architect, record it in the reviewed_by frontmatter, then re-commit."
  fi
done <<< "$PLANS"

eval_exit
