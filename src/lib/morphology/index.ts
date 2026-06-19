// lib/morphology — the Affix Trainer runtime module (capstone surface).
//
// An affix-first LENS over the morphology capabilities: it gathers each affix's
// rule + word-family + progress into one place (sequenced by the research teaching
// order), and launches a SCOPED SESSION to practise an affix. It does filtered
// reads + routes — it renders/resolves/gates/commits NO cards.
//
// Inbound port. Internal files (adapter.ts) stay importable by path for tests.
// MUST NOT import lib/session-builder (target-architecture Rule 7, no back-edge):
// session-builder consumes the affix scope by route, not the reverse.
//
// Module spec: docs/current-system/modules/morphology.md.

// ── Catalog grid ─────────────────────────────────────────────────────────────
export { getAffixCatalog, buildAffixCatalog } from './catalog'

// ── Affix detail (rule card + word-family explorer + progress) ───────────────
export { getAffixDetail, buildAffixDetail, buildWordFamiliesForAffix } from './family'

// ── Practice launch (the scoped-session doorway, capstone item F′) ───────────
export { AFFIX_SESSION_MODE, affixPracticePath, affixScopeFromSnapshot } from './practice'
// The runtime affix-scope resolver imported by the Session page (mirrors
// loadSelectedLessonScope) — resolves an affix label → selectedSourceRefs.
export { loadSelectedAffixScope, loadMorphologySnapshot } from './adapter'
export type { MorphologySnapshot, MorphologyReadClient } from './adapter'

// ── View model ───────────────────────────────────────────────────────────────
export type {
  AffixCatalogTile,
  AffixDetail,
  AffixProgress,
  AffixRuleSource,
  AffixExample,
  WordFamily,
  DerivedForm,
  AffixScope,
  AffixType,
  CefrLevel,
  MasteryLabel,
} from './model'
