// src/lib/mnemonics/index.ts
// Public port for the stubborn-word mnemonic workshop — 6 symbols. Everything else
// in this folder (the two-tier decision in affordance.ts, the Supabase shape in
// adapter.ts) is an implementation detail behind this seam.
// See docs/current-system/modules/mnemonics.md.

export { resolveMnemonicAffordance, type MnemonicGateEvidence } from './affordance'
export { fetchMnemonic, fetchMnemonicsForRefs, upsertMnemonic, deleteMnemonic } from './adapter'
export { labelForSourceRef } from './displayLabel'
export type { Mnemonic, MnemonicAffordance } from './model'
