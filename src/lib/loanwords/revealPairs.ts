// src/lib/loanwords/revealPairs.ts
//
// The curated Dutch→Indonesian loanword "reveal wall" — the single strongest
// hook this product has for a Dutch speaker: you already know ~170 Indonesian
// words before your first lesson.
//
// Shared deliberately between TWO surfaces that must tell the identical story:
//
//   - src/pages/Welkom.tsx — the day-one onboarding reveal (Bet-1 §3.4), which
//     activates the `nl-leenwoorden` collection.
//   - src/pages/Landing.tsx — the PUBLIC landing band, so the promise a visitor
//     sees before signing up is the same one the app opens with. Previously the
//     best hook in the product was visible only AFTER signup, which is the wrong
//     way round for the thing meant to make people sign up.
//
// Hardcoded rather than read from the database, on purpose: anon has no read
// grant on the `indonesian` schema (asserted by `make check-supabase`), and that
// schema also holds learner tables. Opening anon reads to serve a marketing band
// would be a bad trade. Every pair below is a confirmed member of
// `nl-leenwoorden`; the full set is 173 items carrying `loan_source_nl`
// (verified against the live cloud project 2026-08-05).
//
// The mix is deliberate: spelling-shifted "aha" loans (koelkast→kulkas) next to
// near-identical ones (gratis→gratis), because the first kind is delightful and
// the second kind is reassuring.

export interface LoanwordPair {
  /** The Dutch word a reader already knows. */
  nl: string
  /** Its Indonesian form. */
  id: string
}

export const LOANWORD_REVEAL_PAIRS: ReadonlyArray<LoanwordPair> = [
  { nl: 'koelkast', id: 'kulkas' },
  { nl: 'handdoek', id: 'handuk' },
  { nl: 'kantoor', id: 'kantor' },
  { nl: 'paspoort', id: 'paspor' },
  { nl: 'politie', id: 'polisi' },
  { nl: 'kantine', id: 'kantin' },
  { nl: 'knalpot', id: 'knalpot' },
  { nl: 'rekening', id: 'rekening' },
  { nl: 'gratis', id: 'gratis' },
  { nl: 'dokter', id: 'dokter' },
]

/**
 * How many loanwords the product actually teaches. Marketing copy quotes this,
 * so it lives next to the pairs rather than being retyped into a string: the
 * count and the examples should never drift apart.
 *
 * Source of truth is the live database — items with `loan_source_nl` not null.
 * Re-count before changing:
 *   select count(*) from indonesian.learning_items where loan_source_nl is not null;
 */
export const LOANWORD_TOTAL = 173
