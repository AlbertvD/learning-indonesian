// Reason codes for capability → exercise resolution failures. Owned by the
// exercises module because every layer that participates in resolution
// (validator, resolver, projector, builder, capabilityContentService)
// imports them. Living at the leaf breaks the otherwise-circular import
// graph between renderContracts and capabilityContentService.

export type ResolutionReasonCode =
  // Source-ref / capability-shape problems
  | 'unsupported_source_kind'
  | 'sourceref_unparseable'
  | 'item_not_found'
  | 'item_inactive'
  | 'dialogue_line_ref_unparseable'
  | 'dialogue_line_artifact_missing'
  // PR 2: typed-table fetch returns no row for a ready dialogue_line cap.
  // PR 3/4 mirror this with `affixed_form_pair_typed_row_missing` and
  // `pattern_typed_row_missing` — per-source-kind codes so the diagnostic
  // reason alone identifies which byKind/* fetcher broke without parsing
  // the canonical_key.
  | 'dialogue_line_typed_row_missing'
  | 'affixed_form_pair_ref_unparseable'
  | 'affixed_form_pair_artifact_missing'
  // PR 3: typed-table fetch returns no row for a ready affixed_form_pair cap.
  // Mirrors `dialogue_line_typed_row_missing` — the reader switched from the
  // legacy capability_artifacts (root_derived_pair/allomorph_rule) to the typed
  // `affixed_form_pairs` table. `affixed_form_pair_artifact_missing` above is
  // retained for resolver belt-and-braces paths but is no longer emitted by
  // byKind/affixedFormPair.ts.
  | 'affixed_form_pair_typed_row_missing'
  // PR 4: pattern source_kind has no fetcher → ref unparseable, or the typed
  // grammar-exercise table (contrast_pair/sentence_transformation/
  // constrained_translation/cloze_mcq_exercises) returns no row for a ready
  // pattern cap. Mirrors dialogue_line/affixed_form_pair: the per-source-kind
  // code names which byKind/* fetcher broke without parsing the canonical_key.
  | 'pattern_ref_unparseable'
  | 'pattern_typed_row_missing'
  // Content-data gaps
  | 'no_active_variant'
  | 'no_meaning_in_lang'
  | 'malformed_cloze'
  | 'malformed_payload'
  | 'no_distractor_candidates'
  | 'missing_required_artifact'
  // Defensive
  | 'unsupported_exercise_type'
  | 'block_failed_db_fetch'
