// Re-export shim for backward compatibility.
// The implementation moved to src/lib/distractors/semanticGroups.ts during PR-1
// of the capabilityContentService spec. This file is kept until the q3 cleanup
// so existing importers compile unchanged. New code should import from
// '@/lib/distractors' instead.
export { SEMANTIC_GROUPS_NL, SEMANTIC_GROUPS_EN, getSemanticGroup } from './distractors/semanticGroups'
