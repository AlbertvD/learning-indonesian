/**
 * Spoken variant transformation rules.
 *
 * Two tracks:
 *   - learner_spoken: Simplified but correct Indonesian. Uses saya consistently,
 *     tidak for negation, high-frequency vocab, shorter sentences.
 *   - natural_spoken: How native speakers actually talk. Uses aku/kamu,
 *     nggak/gak, discourse markers (sih, nih, dong, kan, lho, ya).
 *
 * Rules are applied in order. Each rule is a regex pattern + replacement
 * for one or both tracks.
 */

export interface TransformRule {
  /** Human-readable name for style_decisions.json */
  name: string
  /** Regex pattern to match (case-insensitive, global) */
  pattern: RegExp
  /** Replacement for learner track (null = no change / keep original) */
  learner: string | null
  /** Replacement for natural track (null = no change / keep original) */
  natural: string | null
}

// ── Pronoun rules ────────────────────────────────────────────────────────────

const pronounRules: TransformRule[] = [
  {
    name: 'pronoun-aku-to-saya-learner',
    pattern: /\baku\b/gi,
    learner: 'saya',
    natural: null, // keep aku in natural
  },
  {
    name: 'pronoun-saya-to-aku-natural',
    pattern: /\bsaya\b/gi,
    learner: null, // keep saya in learner
    natural: 'aku',
  },
  {
    name: 'pronoun-kamu-formal-to-anda-learner',
    pattern: /\bAnda\b/g,
    learner: null, // keep Anda in learner (formal is fine)
    natural: 'kamu',
  },
  {
    name: 'pronoun-engkau-to-kamu-natural',
    pattern: /\bengkau\b/gi,
    learner: 'kamu',
    natural: 'kamu',
  },
]

// ── Negation rules ───────────────────────────────────────────────────────────

const negationRules: TransformRule[] = [
  {
    name: 'negation-tidak-learner',
    // In natural speech, tidak → nggak/gak. In learner, keep tidak.
    // Match "tidak" that isn't already part of "tidak apa-apa" (frozen expression)
    pattern: /\btidak\b(?!\s+apa-apa)/gi,
    learner: null, // keep tidak
    natural: 'nggak',
  },
  {
    name: 'negation-nggak-to-tidak-learner',
    // If source has nggak, normalize to tidak for learner
    pattern: /\b(nggak|ngga|gak|ga)\b/gi,
    learner: 'tidak',
    natural: null, // keep colloquial form
  },
  {
    name: 'negation-belum-keep',
    // belum (not yet) stays in both tracks — it's standard
    pattern: /\bbelum\b/gi,
    learner: null,
    natural: null,
  },
]

// ── Discourse marker rules ───────────────────────────────────────────────────

const discourseMarkerRules: TransformRule[] = [
  {
    name: 'discourse-add-sih',
    // After question words in natural track, add "sih" for emphasis
    // e.g., "Kenapa?" → "Kenapa sih?"
    pattern: /\b(kenapa|mengapa|gimana|bagaimana)\s*\?/gi,
    learner: null,
    natural: '$1 sih?',
  },
  {
    name: 'discourse-add-dong',
    // After imperatives ending with -lah or standalone imperatives
    pattern: /\b(tolong|coba|ayo)\b/gi,
    learner: null,
    natural: '$1 dong',
  },
]

// ── Vocabulary simplification (learner) ──────────────────────────────────────

const vocabSimplificationRules: TransformRule[] = [
  {
    name: 'vocab-mempergunakan-to-pakai',
    pattern: /\b(mempergunakan|menggunakan)\b/gi,
    learner: 'pakai',
    natural: 'pake',
  },
  {
    name: 'vocab-berbicara-to-bicara',
    pattern: /\bberbicara\b/gi,
    learner: 'bicara',
    natural: 'ngomong',
  },
  {
    name: 'vocab-mengatakan-to-bilang',
    pattern: /\bmengatakan\b/gi,
    learner: 'bilang',
    natural: 'bilang',
  },
  {
    name: 'vocab-bagaimana-to-gimana',
    pattern: /\bbagaimana\b/gi,
    learner: null, // keep formal in learner
    natural: 'gimana',
  },
  {
    name: 'vocab-mengapa-to-kenapa',
    pattern: /\bmengapa\b/gi,
    learner: 'kenapa',
    natural: 'kenapa',
  },
  {
    name: 'vocab-hendak-to-mau',
    pattern: /\bhendak\b/gi,
    learner: 'mau',
    natural: 'mau',
  },
  {
    name: 'vocab-tetapi-to-tapi',
    pattern: /\btetapi\b/gi,
    learner: 'tapi',
    natural: 'tapi',
  },
  {
    name: 'vocab-apabila-to-kalau',
    pattern: /\b(apabila|bilamana)\b/gi,
    learner: 'kalau',
    natural: 'kalo',
  },
  {
    name: 'vocab-kalau-to-kalo-natural',
    pattern: /\bkalau\b/gi,
    learner: null,
    natural: 'kalo',
  },
  {
    name: 'vocab-sudah-to-udah-natural',
    pattern: /\bsudah\b/gi,
    learner: null,
    natural: 'udah',
  },
  {
    name: 'vocab-harus-keep',
    pattern: /\bharus\b/gi,
    learner: null,
    natural: null, // harus is standard in both
  },
]

// ── Affix reduction (natural) ────────────────────────────────────────────────

const affixReductionRules: TransformRule[] = [
  {
    name: 'affix-me-drop-natural',
    // Common me- prefix drops in natural speech:
    // melihat → liat, membeli → beli, memakan → makan
    // Only for very common verbs to avoid over-transformation
    pattern: /\bmelihat\b/gi,
    learner: null,
    natural: 'liat',
  },
  {
    name: 'affix-membeli-to-beli-natural',
    pattern: /\bmembeli\b/gi,
    learner: 'beli',
    natural: 'beli',
  },
  {
    name: 'affix-memakan-to-makan',
    pattern: /\bmemakan\b/gi,
    learner: 'makan',
    natural: 'makan',
  },
  {
    name: 'affix-memberikan-to-kasih-natural',
    pattern: /\bmemberikan\b/gi,
    learner: 'memberi',
    natural: 'kasih',
  },
]

// ── All rules in application order ───────────────────────────────────────────

export const allRules: TransformRule[] = [
  ...pronounRules,
  ...negationRules,
  ...discourseMarkerRules,
  ...vocabSimplificationRules,
  ...affixReductionRules,
]
