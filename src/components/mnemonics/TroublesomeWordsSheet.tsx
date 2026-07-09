// src/components/mnemonics/TroublesomeWordsSheet.tsx
//
// Home's picker sheet (home-mnemonic-weak-words-surface slice 1, §4) — a thin
// Modal wrapping the shared MnemonicWordChips body. Home passes exactly the
// un-hooked troublesome entries (so the card's count and the sheet's list
// always match, §3's one-denominator rule); tapping a chip opens
// MnemonicWorkshop to create a hook, and the word drops out of the set on the
// next open (the set is derived fresh each load — no stale list, §4).
//
// Mounted conditionally by Dashboard (only while opened), mirroring the
// workshopEntry-conditional pattern MnemonicWorkshop's own callers already use
// — so `opened` is always `true` for the lifetime of this component instance.
import { Modal } from '@mantine/core'
import { useT } from '@/hooks/useT'
import { MnemonicWordChips, type MnemonicWordChipsEntry } from './MnemonicWordChips'

export interface TroublesomeWordsSheetProps {
  userId: string
  entries: MnemonicWordChipsEntry[]
  onClose: () => void
}

export function TroublesomeWordsSheet({ userId, entries, onClose }: TroublesomeWordsSheetProps) {
  const T = useT()
  return (
    <Modal opened onClose={onClose} title={T.dashboard.troublesomeWordsSheetTitle} size="md">
      <MnemonicWordChips userId={userId} entries={entries} />
    </Modal>
  )
}
