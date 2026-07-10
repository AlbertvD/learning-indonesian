// src/components/mnemonics/MnemonicWorkshop.tsx
// The shared mnemonic editor (design §4.2, §6a.B) — reused from both the
// feedback-screen create/resurface affordance (experience/) and the Progress
// stubborn-words card (progress/). Lives in a NEUTRAL components/mnemonics/ home
// (not components/progress/) so neither consumer imports the other's folder.
//
// Self-contained I/O: fetches the existing note on open and saves via
// lib/mnemonics — the one place in this feature allowed to do both (the
// ExperiencePlayer, by contrast, must stay DB-read-free; see
// docs/current-system/modules/mnemonics.md).

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal, Textarea, Button } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { SectionHeading } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { fetchMnemonic, upsertMnemonic } from '@/lib/mnemonics'
import classes from './MnemonicWorkshop.module.css'

const FIRST_RUN_SEEN_KEY = 'mnemonic-workshop-first-run-seen'

export interface MnemonicWorkshopProps {
  userId: string
  /** The word's content identity (`learning_capabilities.source_ref`) — the mnemonic key. */
  sourceRef: string
  /** Display label for the word being worked on (e.g. the stripped surface form). */
  label: string
  /** Affixed/morphology-sourced word — leads with the "break it into parts" prompt. */
  isAffixed?: boolean
  opened: boolean
  onClose: () => void
  /** Fired after a successful save, with the trimmed note — lets a host (e.g.
   *  ExperiencePlayer) update its own in-session note map without a re-fetch. */
  onSaved?: (note: string) => void
}

export function MnemonicWorkshop({ userId, sourceRef, label, isAffixed = false, opened, onClose, onSaved }: MnemonicWorkshopProps) {
  const T = useT()
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firstRunSeen, setFirstRunSeen] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!opened) return
    setFirstRunSeen(typeof window !== 'undefined' && window.localStorage.getItem(FIRST_RUN_SEEN_KEY) === 'true')

    let active = true
    setLoading(true)
    fetchMnemonic(userId, sourceRef)
      .then((existing) => {
        if (active) setNote(existing?.note ?? '')
      })
      .catch((err) => {
        logError({ page: 'mnemonic-workshop', action: 'fetchMnemonic', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.mnemonic.loadFailed })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [opened, userId, sourceRef, T.common.error, T.mnemonic.loadFailed])

  function dismissFirstRun() {
    setFirstRunSeen(true)
    if (typeof window !== 'undefined') window.localStorage.setItem(FIRST_RUN_SEEN_KEY, 'true')
  }

  async function handleSave() {
    const trimmed = note.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await upsertMnemonic(userId, sourceRef, trimmed)
      onSaved?.(trimmed)
      onClose()
    } catch (err) {
      logError({ page: 'mnemonic-workshop', action: 'upsertMnemonic', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.mnemonic.saveFailed })
    } finally {
      setSaving(false)
    }
  }

  const prompts = [
    { key: 'sound', title: T.mnemonic.promptSoundTitle, example: T.mnemonic.promptSoundExample },
    { key: 'sentence', title: T.mnemonic.promptSentenceTitle, example: T.mnemonic.promptSentenceExample },
    { key: 'breakdown', title: T.mnemonic.promptBreakdownTitle, example: T.mnemonic.promptBreakdownExample, link: T.mnemonic.promptBreakdownLink },
  ]
  const orderedPrompts = isAffixed
    ? [prompts[2]!, prompts[0]!, prompts[1]!]
    : prompts

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="md"
      centered
      withCloseButton={false}
      overlayProps={{ blur: 3 }}
      classNames={{ content: classes.content, body: classes.body, overlay: classes.overlay }}
    >
      <div className={classes.header}>
        <div>
          <div className={classes.title}>{T.mnemonic.workshopTitle}</div>
          <div className={classes.word}>{label}</div>
        </div>
        <button type="button" className={classes.close} onClick={onClose} aria-label={T.mnemonic.cancelButton}>
          <IconX size={20} />
        </button>
      </div>

      {!firstRunSeen && (
        <div className={classes.callout}>
          <div className={classes.calloutBody}>
            <div className={classes.calloutTitle}>{T.mnemonic.firstRunTitle}</div>
            <div className={classes.calloutText}>{T.mnemonic.firstRunBody}</div>
          </div>
          <button
            type="button"
            className={classes.calloutDismiss}
            onClick={dismissFirstRun}
            aria-label={T.mnemonic.firstRunDismiss}
          >
            <IconX size={16} />
          </button>
        </div>
      )}

      <p className={classes.intro}>{T.mnemonic.workshopIntro}</p>

      <div>
        <SectionHeading>{T.mnemonic.chooseAngle}</SectionHeading>
        <div className={classes.angles}>
          {orderedPrompts.map((prompt) => (
            <div key={prompt.key} className={classes.angle}>
              <span className={classes.angleTitle}>{prompt.title}</span>
              <span className={classes.angleExample}>{prompt.example}</span>
              {prompt.link && (
                <Link to="/morphology" className={classes.angleLink}>
                  {prompt.link}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
        placeholder={T.mnemonic.notePlaceholder}
        autosize
        minRows={3}
        maxLength={1000}
        disabled={loading}
        classNames={{ input: classes.textareaInput }}
      />

      <div className={classes.footer}>
        <Button variant="subtle" color="gray" onClick={onClose}>{T.mnemonic.cancelButton}</Button>
        <Button onClick={handleSave} loading={saving} disabled={loading || !note.trim()}>
          {T.mnemonic.saveButton}
        </Button>
      </div>
    </Modal>
  )
}
