// Public surface for the distractors module.
// Extracted from src/lib/sessionQueue.ts (cascade + helpers) and
// src/lib/semanticGroups.ts (semantic grouping) as part of PR-1 of the
// capabilityContentService spec. The legacy paths now contain re-export
// shims so existing importers compile unchanged.

export { pickDistractorCascade, type DistractorCandidate } from './cascade'
export { STRUCTURALLY_SIMILAR_TYPES } from './structuralTypes'
export { optionComponents, sharesMeaningfulWord } from './options'
export { SEMANTIC_GROUPS_NL, SEMANTIC_GROUPS_EN, getSemanticGroup } from './semanticGroups'
