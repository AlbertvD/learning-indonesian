// Lesson 22 (Bab 6, Pesta Pernikahan / Verdubbelingen) — reduplication application tier.
//
// Judgment-only authoring (ADR 0019, amended 2026-06-19;
// docs/plans/2026-06-19-l22-reduplication-engine-extension.md). A human authors ONLY
// (root, affix, illustratesCategory); the deterministic engine + the generation
// script (scripts/generate-morphology-patterns.ts) fill the rule-governed fields
// (derived, allomorphRule, circumfix=null for reduplication) and harvest the carrier.
//
// SCOPE — only PRODUCTIVE, compositional reduplications become pairs (research §25/§106):
// full noun reduplication, reduplication + -an, and the ke-…-an colour reduplication.
// Frozen / sound-change / fixed-adverb / asymmetric ME-redup forms (alun-alun,
// kura-kura, sayur-mayur, warna-warni, hati-hati, jalan-jalan, sewa-menyewa) are
// VOCABULARY, not morphology pairs — authoring them as rules would teach false
// generalisations.
//
// Every root MUST already be a live learning_item from a PRIOR lesson (the engine
// reads the DB; L22's own new colour/noun vocab is not yet live at generate time).
// Verified prior-lesson headwords: kota(L3) anak(L4) rumah(L1) sayur(L4) buah(L1)
// biru(L6) hitam(L6) kuning(L4) hijau(L8) putih(L4). illustratesCategory is the
// EXACT title of a grammar category in this lesson's lesson.ts content.categories.

import type { MorphologyRoot } from '@/lib/capabilities'

const NOUN = '2. Verdubbeling van het zelfstandig naamwoord — meervoud mét diversiteit'
const NOUN_AN = 'Verdubbeling van het zelfstandig naamwoord plus -AN'
const COLOR = 'Kleurnuances — muda/tua, vruchtvergelijkingen en de ke-...-an "-achtig" verdubbeling'

export const morphologyRoots: MorphologyRoot[] = [
  // ── Full noun reduplication (plurality-with-diversity) ─────────────────────
  { root: 'kota', affix: 'reduplication', illustratesCategory: NOUN },   // kota-kota
  { root: 'anak', affix: 'reduplication', illustratesCategory: NOUN },   // anak-anak
  { root: 'rumah', affix: 'reduplication', illustratesCategory: NOUN },  // rumah-rumah

  // ── Reduplication + -an (collective) ───────────────────────────────────────
  { root: 'sayur', affix: 'reduplication-an', illustratesCategory: NOUN_AN }, // sayur-sayuran
  { root: 'buah', affix: 'reduplication-an', illustratesCategory: NOUN_AN },  // buah-buahan

  // ── ke-…-an colour reduplication ("-achtig" / "-ish") ──────────────────────
  { root: 'biru', affix: 'ke-…-an-reduplication', illustratesCategory: COLOR },   // kebiru-biruan
  { root: 'hitam', affix: 'ke-…-an-reduplication', illustratesCategory: COLOR },  // kehitam-hitaman
  { root: 'kuning', affix: 'ke-…-an-reduplication', illustratesCategory: COLOR }, // kekuning-kuningan
  { root: 'hijau', affix: 'ke-…-an-reduplication', illustratesCategory: COLOR },  // kehijau-hijauan
  { root: 'putih', affix: 'ke-…-an-reduplication', illustratesCategory: COLOR },  // keputih-putihan
]
