// The "Schaduw de dialoog" sentence set — a curated catalog-as-code constant,
// mirroring pitfallCatalog.ts's rationale (ADR 0025): a frozen, hand-picked
// reference list with no per-row authoring and no runtime writes. Content
// edit = code edit, no schema (UP5 shape (c), docs/plans/2026-07-09-
// uitspraak-round2.md §3).
//
// Curated for PROSODY value, not vocabulary coverage — greetings, question
// contours, exclamations, particles ('dong', 'sih'), and leave-taking, the
// sentence-level melody/rhythm patterns word-level shadowing (ShadowControl
// on individual example words, PitfallCard.tsx) doesn't train. Sentences are
// drawn from existing dialogue audio already seeded in `audio_clips`
// (resolved via the same voice-agnostic RPC path as the rest of the primer —
// no new TTS synthesis needed for this set).

export interface DialogueShadowSentence {
  /** Stable slug, unique across the set. */
  id: string
  /** The Indonesian sentence, exactly as stored (matches an existing dialogue clip's text_content). */
  text: string
}

export const DIALOGUE_SHADOW_SET: ReadonlyArray<DialogueShadowSentence> = [
  { id: 'groet-kabar', text: 'Selamat siang, apa kabar? Bapak dari mana?' },
  { id: 'vraag-tinggal', text: 'Di mana Bapak tinggal?' },
  { id: 'vraag-harga', text: 'Berapa harga mobil ini?' },
  { id: 'uitroep-batik', text: 'Wah, batik ini halus sekali!' },
  { id: 'partikel-dong', text: 'Lihat dong! Kain ini bagus sekali.' },
  { id: 'partikel-sih', text: 'Apa sih? Saya tidak mengerti.' },
  { id: 'dank-kembali', text: 'Terima kasih kembali, Bu.' },
  { id: 'afscheid', text: 'Sampai bertemu lagi, Pak.' },
  { id: 'uitnodiging', text: 'Silakan masuk, Pak, kita berangkat.' },
  { id: 'excuus', text: 'Maaf, saya betul-betul lupa.' },
]
