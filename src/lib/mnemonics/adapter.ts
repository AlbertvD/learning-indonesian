// src/lib/mnemonics/adapter.ts
// The only I/O in `lib/mnemonics/` — reads/writes `indonesian.learner_word_mnemonics`.
// Hides the schema, the table name, snake<->camel mapping, and owner scoping (every
// query is user_id-scoped; RLS backs it up). One row per (user_id, source_ref) — see
// scripts/migration.sql for the DDL and docs/plans/2026-07-05-stubborn-word-mnemonic-workshop.md §5.

import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'
import type { Mnemonic } from './model'

interface MnemonicRow {
  source_ref: string
  note: string
  created_at: string
  updated_at: string
}

function toMnemonic(row: MnemonicRow): Mnemonic {
  return {
    sourceRef: row.source_ref,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The learner's saved hook for one word, or `null` if they haven't made one yet. */
export async function fetchMnemonic(userId: string, sourceRef: string): Promise<Mnemonic | null> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_word_mnemonics')
    .select('source_ref, note, created_at, updated_at')
    .eq('user_id', userId)
    .eq('source_ref', sourceRef)
    .maybeSingle()
  if (error) throw error
  return data ? toMnemonic(data as MnemonicRow) : null
}

/**
 * Batch lookup for a session's (or a stubborn-words list's) source_refs, shaped as
 * a `Map<sourceRef, note>` for O(1) per-block lookup — the host prefetch this
 * feature needs (mirrors `audioMap`, Session.tsx). Chunked: the ref list is
 * content-derived and can grow with session/content size (chunkedQuery.ts).
 */
export async function fetchMnemonicsForRefs(userId: string, sourceRefs: string[]): Promise<Map<string, string>> {
  if (sourceRefs.length === 0) return new Map()
  const rows = await chunkedIn<Pick<MnemonicRow, 'source_ref' | 'note'>>(
    'learner_word_mnemonics',
    'source_ref',
    sourceRefs,
    (b) => b.select('source_ref, note').eq('user_id', userId),
  )
  return new Map(rows.map((row) => [row.source_ref, row.note]))
}

/**
 * Create or edit the learner's hook for a word. `updated_at` is set explicitly —
 * the DDL's `default now()` only fires on INSERT, so an `on conflict do update`
 * would otherwise leave a stale `updated_at` on every edit (data-architect R2 MINOR).
 */
export async function upsertMnemonic(userId: string, sourceRef: string, note: string): Promise<Mnemonic> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_word_mnemonics')
    .upsert(
      { user_id: userId, source_ref: sourceRef, note, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,source_ref' },
    )
    .select('source_ref, note, created_at, updated_at')
    .single()
  if (error) throw error
  return toMnemonic(data as MnemonicRow)
}

/** Remove the learner's hook for a word entirely. */
export async function deleteMnemonic(userId: string, sourceRef: string): Promise<void> {
  const { error } = await supabase
    .schema('indonesian')
    .from('learner_word_mnemonics')
    .delete()
    .eq('user_id', userId)
    .eq('source_ref', sourceRef)
  if (error) throw error
}
