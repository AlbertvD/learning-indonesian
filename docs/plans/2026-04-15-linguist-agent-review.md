# Linguist Agent Review — 2026-04-15

Review of the `linguist-creator` and `linguist-reviewer` agent definitions, their outputs across 7 lessons, and recommendations.

---

## Overall Assessment

The agents are **well-designed and effective**. The creator-reviewer loop works: all 7 lessons reached `approved` status, with 5-7 revision cycles each — an acceptable convergence rate for complex content generation. The review reports are thorough and the severity system (CRITICAL blocks, WARNING flags) is sound.

Combined output: **400 exercise candidates**, **39 grammar patterns**, **~290 cloze contexts** across 7 lessons.

---

## Findings

### 1. `contrast_pair` option ID convention is inconsistently enforced

**The spec says:** `option.id` must equal `option.text` (the Indonesian word/phrase). `correctOptionId` must match.

**Reality:** 4 of 7 lessons (1, 2, 5, 7) use abstract IDs (`"a"`, `"b"`) instead. The app's `makeGrammarExercise()` in `sessionQueue.ts:229-240` normalizes these at runtime, so it works — but:
- It's unnecessary runtime work
- It's a violation of the creator's own documented convention
- The reviewer doesn't check for it (only checks that `correctOptionId` matches *some* `option.id`)

**Root cause:** The creator spec documents the convention clearly (lines 255), but the reviewer spec (line 66) only checks referential integrity, not the `id === text` convention. The creator was inconsistent across runs and the reviewer never caught it.

**Fix:** Add a CRITICAL check to the reviewer: "contrast_pair option.id must equal option.text — abstract IDs like 'a'/'b' are not allowed." Alternatively, if the runtime normalization is considered acceptable, downgrade to WARNING and document the convention as preferred-not-required.

### 2. Revision count (5-7 per lesson) is high

All 7 lessons required 5-7 creator-reviewer cycles to reach approved. This suggests the creator produces content that the reviewer consistently rejects on first pass.

**Common first-pass failures (based on review report evolution):**
- Missing `answer` fields in translation drills
- `contrast_pair` prompts that reveal the answer
- `targetMeaning` repeating the prompt text
- Slug conflicts with existing patterns
- Missing cloze contexts for items with `=` in base_text

**Recommendation:** The creator spec already documents these rules, but the creator agent doesn't internalize them well enough on first pass. Consider:
- Adding a "self-check" step to the creator (Step 4.5) that runs the reviewer's CRITICAL checks locally before outputting files. This would catch structural errors without requiring a full reviewer round-trip.
- Alternatively, add a "common mistakes" section at the top of the creator spec listing the top 5 first-pass failures with concrete examples of what NOT to do.

### 3. Cross-lesson vocabulary pool query could be expensive

The creator runs a SQL query (Step 0a) to load all vocabulary from prior lessons. For lesson 7, that's 6 prior lessons worth of items. This works now but will slow down linearly as more lessons are added.

**Not urgent** — with 7 lessons the pool is manageable. Worth noting for lesson 20+.

### 4. Web research step is valuable but not verifiable

Step 0c requires web research for each grammar pattern (2+ searches per pattern). This is excellent for quality — it produces better example sentences and more natural exercises. However:
- The reviewer has no way to verify that web research was actually conducted
- The quality of research varies by pattern and by what sources are available
- Research results aren't persisted anywhere

**Recommendation:** This is acceptable as-is. The reviewer catches poor exercise quality via the WARNING-level pedagogical checks, which is a good proxy for "the creator didn't do enough research." No change needed.

### 5. Reviewer report format evolved organically

Lesson 6's review report has rich `counts` and `checks` sections that earlier lessons lack. The reviewer evolved its output format over time without updating its spec.

| Lesson | Report has `counts`? | Report has `checks`? |
|--------|---------------------|---------------------|
| 1-5 | No | No |
| 6 | Yes (detailed) | Yes (detailed) |
| 7 | No | No |

**Recommendation:** The detailed format from lesson 6 is superior — it provides verifiable evidence of each check. Update the reviewer spec to require `counts` and `checks` sections in every report. This makes the review auditable.

### 6. The creator spec is very long (432 lines)

The creator agent definition is comprehensive but long. An Opus model processes it fully, but there's a risk of attention dilution — the agent may miss rules buried in the middle.

**Structure observation:** The spec is well-organized (Steps 0-5 + principles + grammar context). The quality rules for candidates (lines 328-344) are the most critical and most commonly violated section. They're positioned correctly (within the step that produces candidates) but could benefit from being more prominent.

**Recommendation:** No structural change needed. The spec's length is justified by the task complexity. The "common mistakes" addition suggested in finding #2 would address the attention dilution risk.

### 7. Cloze context coverage is thorough

Every lesson achieves near-100% coverage of vocabulary items with cloze contexts. The only skipped items are discourse particles (`deh`, `sih`) which the spec explicitly permits. This is working well.

### 8. Exercise type distribution is well-balanced

Lesson 6 (the most detailed report) shows all 7 grammar patterns have all 4 exercise types with ~10 candidates each. The scaffolded progression (recognition → production) is followed. This matches the SLA principles documented in the spec.

### 9. No test coverage for agent output format

There are no automated tests that validate the staging file schemas. The publish script (`publish-approved-content.ts`) acts as a de facto validation gate, but failures there are caught late in the pipeline. A simple JSON schema validation script for each staging file type would catch structural issues before the reviewer even runs.

### 10. The `review_status: 'pending_review'` field is misleading

The creator spec says all candidates must have `review_status: 'pending_review'`, but the actual files show `"review_status": "published"` — because the publish script updates them after publishing. This means the staging files are modified by the publish step, making them not truly "staging" anymore. They're a mix of source-of-truth and deployment artifacts.

**Impact:** If the creator reruns for a lesson, it will overwrite the `published` status back to `pending_review`. This is documented behavior ("on rerun, regenerates all output files completely") but could be surprising.

---

## Summary: Recommended Changes

### High impact, low effort
1. **Add `id === text` check to reviewer** — prevents the inconsistent option ID format (add 1 line to reviewer spec section 3)
2. **Add "Common First-Pass Mistakes" section to creator** — list top 5 mistakes with examples, positioned before Step 0 so the creator sees them first

### Medium impact, medium effort
3. **Standardize reviewer report format** — require `counts` and `checks` sections (based on lesson 6 model). Update reviewer spec section "What you write"
4. **Add staging file schema validation script** — a `scripts/validate-staging.ts` that checks all staging files against TypeScript interfaces without needing the reviewer agent

### Low priority (awareness only)
5. Cross-lesson vocabulary pool query scaling (not urgent until lesson 20+)
6. Creator spec length (432 lines) — acceptable for Opus, but monitor if quality degrades with future additions
7. Staging files as dual source-of-truth/deployment artifacts — documented behavior, no change needed
