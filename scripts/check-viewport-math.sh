#!/usr/bin/env bash
# scripts/check-viewport-math.sh
# Enforces the page framework seam contract: viewport-height units
# (100dvh / 100vh / 100svh / 100lvh) live only in allowlisted files.
# See docs/plans/2026-04-24-page-framework-design.md §4.3.

set -euo pipefail

ALLOWLIST=(
  "src/components/page/primitives/PageContainer.module.css"
  "src/components/page/primitives/PageBody.module.css"
  "src/components/page/primitives/PageFormLayout.module.css"
  "src/components/MobileLayout.module.css"
  "src/components/Layout.module.css"
)

# Match only real CSS declarations: line begins with optional whitespace,
# then property: value, required trailing semicolon. Documentary mentions of
# the rule inside CSS comments don't match because comment lines start with
# `*` or `/*` (or have backticks around the rule).
PATTERN='^[[:space:]]*(min-height|height|max-height):[[:space:]]*100(dvh|vh|svh|lvh)[[:space:]]*;'

SEARCH_PATHS=(
  "src/components"
  "src/pages"
)

violations=0

for path in "${SEARCH_PATHS[@]}"; do
  [[ -d "$path" ]] || continue
  while IFS= read -r -d '' file; do
    # Strip leading ./ if present so comparisons match the allowlist paths.
    rel="${file#./}"

    # Allowlist check.
    skip=0
    for allowed in "${ALLOWLIST[@]}"; do
      if [[ "$rel" == "$allowed" ]]; then
        skip=1
        break
      fi
    done
    [[ $skip -eq 1 ]] && continue

    # Scan, excluding lines that carry a `skip-check:` escape (CSS uses /* skip-check: */ form).
    matches="$(grep -nE "$PATTERN" "$rel" 2>/dev/null | grep -v 'skip-check:' || true)"
    if [[ -n "$matches" ]]; then
      echo "✗ viewport-math violation in $rel:"
      echo "$matches" | sed 's/^/    /'
      violations=$((violations + 1))
    fi
  done < <(find "$path" -type f -name "*.module.css" -print0)
done

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "✗ $violations file(s) violate the seam contract."
  echo "  Viewport-height math belongs only in: "
  for f in "${ALLOWLIST[@]}"; do
    echo "    - $f"
  done
  echo "  Wrap the surface in <PageBody variant='fit'> or add a /* skip-check: <reason> */ comment on the line."
  exit 1
fi

echo "✓ Viewport-math seam contract clean."
