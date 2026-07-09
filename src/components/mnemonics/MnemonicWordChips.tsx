// src/components/mnemonics/MnemonicWordChips.tsx
//
// Neutral chip-list body: one tappable chip per {sourceRef, sourceKind} entry,
// with a has-hook dot and the MnemonicWorkshop wired for create/edit. Extracted
// 2026-07-09 (home-mnemonic-weak-words-surface slice 1) out of
// StubbornWordsCard.tsx:52-115 so the Home TroublesomeWordsSheet and the
// Voortgang StubbornWordsCard share one implementation instead of drifting.
//
// The SOLE holder of the `labelForSourceRef` call: callers pass raw
// {sourceRef, sourceKind} (mirroring the analytics-layer shape verbatim — see
// TroublesomeWord / StubbornWord in masteryModel.ts), this component computes
// `label` + `isAffixed` itself. Keeping label computation here (not in
// lib/analytics/) is what lets deriveTroublesomeWords stay label-free and avoid
// an analytics → mnemonics back-edge (mnemonics already imports isStubborn FROM
// analytics — target-arch Rule #7).
// See docs/current-system/modules/mnemonics.md.
import { useEffect, useState } from 'react'
import type { CapabilitySourceKind } from '@/lib/capabilities'
import { fetchMnemonicsForRefs, labelForSourceRef } from '@/lib/mnemonics'
import { MnemonicWorkshop } from './MnemonicWorkshop'
import { logError } from '@/lib/logger'
import classes from './MnemonicWordChips.module.css'

export interface MnemonicWordChipsEntry {
  sourceRef: string
  sourceKind: CapabilitySourceKind
}

export interface MnemonicWordChipsProps {
  userId: string
  entries: MnemonicWordChipsEntry[]
}

interface ResolvedEntry {
  sourceRef: string
  label: string
  isAffixed: boolean
}

export function MnemonicWordChips({ userId, entries }: MnemonicWordChipsProps) {
  const [notesBySourceRef, setNotesBySourceRef] = useState<Map<string, string>>(new Map())
  const [workshopEntry, setWorkshopEntry] = useState<ResolvedEntry | null>(null)

  const resolved: ResolvedEntry[] = entries.map((entry) => ({
    sourceRef: entry.sourceRef,
    label: labelForSourceRef(entry.sourceRef),
    isAffixed: entry.sourceKind === 'word_form_pair_src',
  }))
  // A stable primitive dependency (resolved is a fresh array every render).
  const sourceRefsKey = resolved.map((e) => e.sourceRef).join(',')

  useEffect(() => {
    if (!sourceRefsKey) return
    let active = true
    fetchMnemonicsForRefs(userId, sourceRefsKey.split(','))
      .then((map) => active && setNotesBySourceRef(map))
      .catch((err) => {
        // Best-effort secondary read (only affects the has-note dot) — mirrors
        // the pre-extraction StubbornWordsCard behaviour, silent log only.
        logError({ page: 'mnemonic-word-chips', action: 'fetchMnemonics', error: err })
      })
    return () => {
      active = false
    }
  }, [userId, sourceRefsKey])

  if (resolved.length === 0) return null

  return (
    <>
      <div className={classes.chips}>
        {resolved.map((entry) => (
          <button
            key={entry.sourceRef}
            type="button"
            className={classes.chip}
            onClick={() => setWorkshopEntry(entry)}
          >
            {entry.label}
            {notesBySourceRef.has(entry.sourceRef) && (
              <span className={classes.hasNoteDot} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {workshopEntry && (
        <MnemonicWorkshop
          userId={userId}
          sourceRef={workshopEntry.sourceRef}
          label={workshopEntry.label}
          isAffixed={workshopEntry.isAffixed}
          opened
          onClose={() => setWorkshopEntry(null)}
          onSaved={(note) => setNotesBySourceRef((m) => new Map(m).set(workshopEntry.sourceRef, note))}
        />
      )}
    </>
  )
}
