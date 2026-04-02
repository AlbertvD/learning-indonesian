---
name: bracket_stripping_pattern
description: Parenthetical translations like "(At the Market)" must be stripped from all display strings using a consistent regex
type: feedback
---

Always apply `.replace(/\s*\([^)]*\)/g, '')` when rendering any title or name sourced from the database or lesson data — lesson titles, section titles, card set names, etc.

**Why:** The source data (lessons, card sets) contains parenthetical translations for authoring clarity (e.g. "Di Pasar (At the Market)", "Vocabulaire (Vocabulary)"). These should never appear in the UI.

**How to apply:** Any time a new component or page renders a `lesson.title`, `set.name`, `section.title`, or similar field, check that the bracket-stripping regex is applied. The pattern was found to be inconsistently applied across the codebase — some places had it, others didn't.
