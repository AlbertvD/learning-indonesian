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
