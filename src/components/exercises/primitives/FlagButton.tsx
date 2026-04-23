// src/components/exercises/primitives/FlagButton.tsx
// Admin flag-for-review primitive. Mobile: bottom sheet (Drawer). Desktop:
// refreshed popover. Comment-first (no chips). Auto-focused textarea uses
// .exerciseInput class to pin font-size ≥16px (kills iOS zoom).
// See docs/plans/2026-04-23-exercise-framework-design.md §6.12
//
// Wired into ExerciseShell in PR #6 (along with the DB migration that makes
// content_flags.flag_type nullable). Built here so the design lab can show it.

import { useState, useEffect } from 'react'
import { ActionIcon, Drawer, Popover, Textarea, Button, Stack, Text } from '@mantine/core'
import { IconFlag, IconFlag2Filled } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { contentFlagService } from '@/services/contentFlagService'
import { logError } from '@/lib/logger'
import type { ContentFlag, ExerciseType } from '@/types/learning'
import classes from './FlagButton.module.css'

export interface FlagButtonProps {
  userId: string
  learningItemId: string | null
  grammarPatternId?: string | null
  exerciseType: ExerciseType
  exerciseVariantId?: string | null
  existingFlag?: ContentFlag | null
  onFlagged?: (flag: ContentFlag) => void
  onUnflagged?: () => void
}

export function FlagButton({
  userId,
  learningItemId,
  grammarPatternId = null,
  exerciseType,
  exerciseVariantId = null,
  existingFlag = null,
  onFlagged,
  onUnflagged,
}: FlagButtonProps) {
  const [opened, setOpened] = useState(false)
  const [comment, setComment] = useState(existingFlag?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  )
  const isFlagged = existingFlag != null

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleSave = async () => {
    const trimmed = comment.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const flag = await contentFlagService.upsertFlag({
        userId,
        learningItemId,
        grammarPatternId,
        exerciseType,
        exerciseVariantId,
        // Chips were cut from the UI per design §6.12; every flag is
        // uncategorized. We send 'other' (the existing fallback enum value)
        // so the write succeeds whether the DB schema has the flag_type
        // NOT NULL + CHECK constraint (pre-migration) or not (post-migration,
        // per §12.1). Admin review can keyword-extract from comments.
        flagType: 'other',
        comment: trimmed,
      })
      onFlagged?.(flag)
      setOpened(false)
      notifications.show({ color: 'orange', message: 'Oefening gemarkeerd voor review.' })
    } catch (err) {
      logError({ page: 'flag-button', action: 'upsertFlag', error: err })
      notifications.show({ color: 'red', title: 'Fout', message: 'Kon markering niet opslaan.' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!existingFlag) return
    setRemoving(true)
    try {
      await contentFlagService.resolveFlag(existingFlag.id)
      setComment('')
      onUnflagged?.()
      setOpened(false)
      notifications.show({ color: 'gray', message: 'Markering verwijderd.' })
    } catch (err) {
      logError({ page: 'flag-button', action: 'resolveFlag', error: err })
      notifications.show({ color: 'red', title: 'Fout', message: 'Kon markering niet verwijderen.' })
    } finally {
      setRemoving(false)
    }
  }

  const form = (
    <Stack gap="sm">
      <Text size="sm" fw={600}>Markeer voor review</Text>
      <Textarea
        placeholder="Wat klopt er niet?"
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
        autosize
        minRows={3}
        autoFocus
        classNames={{ input: `exerciseInput ${classes.textarea}` }}
      />
      <Stack gap="xs">
        <Button
          color="orange"
          onClick={handleSave}
          loading={saving}
          disabled={!comment.trim()}
          fullWidth
        >
          Opslaan
        </Button>
        {existingFlag && (
          <Button
            variant="subtle"
            color="red"
            onClick={handleRemove}
            loading={removing}
            fullWidth
          >
            Verwijder markering
          </Button>
        )}
      </Stack>
    </Stack>
  )

  const trigger = (
    <ActionIcon
      variant="subtle"
      color={isFlagged ? 'orange' : 'gray'}
      className={classes.trigger}
      onClick={() => setOpened(true)}
      title="Markeer voor review"
      aria-label="Markeer voor review"
    >
      {isFlagged ? <IconFlag2Filled size={18} /> : <IconFlag size={18} />}
    </ActionIcon>
  )

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer
          opened={opened}
          onClose={() => setOpened(false)}
          position="bottom"
          size="45vh"
          title="Markeer voor review"
          overlayProps={{ backgroundOpacity: 0.3 }}
          withCloseButton
          classNames={{ content: classes.sheet, body: classes.sheetBody }}
        >
          {form}
        </Drawer>
      </>
    )
  }

  // Desktop — refreshed popover (widened to 360px, no SegmentedControl).
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-end"
      withArrow
      shadow="md"
      width={360}
      closeOnClickOutside={false}
      trapFocus
    >
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown>{form}</Popover.Dropdown>
    </Popover>
  )
}
