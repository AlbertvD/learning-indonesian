import { useState } from 'react'
import { ActionIcon, Popover, Stack, Text, Textarea, Button, Group, SegmentedControl } from '@mantine/core'
import { IconFlag, IconFlag2Filled } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { contentFlagService } from '@/services/contentFlagService'
import { logError } from '@/lib/logger'
import type { ContentFlag, ExerciseType, FlagType } from '@/types/learning'

interface FlagButtonProps {
  userId: string
  learningItemId: string
  exerciseType: ExerciseType
  exerciseVariantId?: string | null
  existingFlag?: ContentFlag | null
  onFlagged?: (flag: ContentFlag) => void
}

const FLAG_OPTIONS: { value: FlagType; label: string }[] = [
  { value: 'wrong_translation', label: 'Verkeerde vertaling' },
  { value: 'bad_sentence', label: 'Slechte zin' },
  { value: 'confusing', label: 'Verwarrend' },
  { value: 'sunset', label: 'Verwijderen' },
  { value: 'other', label: 'Anders' },
]

export function FlagButton({
  userId,
  learningItemId,
  exerciseType,
  exerciseVariantId = null,
  existingFlag = null,
  onFlagged,
}: FlagButtonProps) {
  const [opened, setOpened] = useState(false)
  const [flagType, setFlagType] = useState<FlagType>(existingFlag?.flagType ?? 'wrong_translation')
  const [comment, setComment] = useState(existingFlag?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const isFlagged = existingFlag != null

  const handleSave = async () => {
    setSaving(true)
    try {
      const flag = await contentFlagService.upsertFlag({
        userId,
        learningItemId,
        exerciseType,
        exerciseVariantId,
        flagType,
        comment: comment.trim() || null,
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

  return (
    <Popover opened={opened} onChange={setOpened} position="top-end" withArrow shadow="md" width={280}>
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color={isFlagged ? 'orange' : 'gray'}
          size="sm"
          onClick={() => setOpened(o => !o)}
          title="Markeer voor review"
          style={{ position: 'absolute', top: 8, right: 8 }}
        >
          {isFlagged ? <IconFlag2Filled size={16} /> : <IconFlag size={16} />}
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="sm" fw={600}>Markeer voor review</Text>
          <SegmentedControl
            value={flagType}
            onChange={v => setFlagType(v as FlagType)}
            data={FLAG_OPTIONS}
            orientation="vertical"
            size="xs"
            fullWidth
          />
          <Textarea
            placeholder="Optionele toelichting..."
            value={comment}
            onChange={e => setComment(e.currentTarget.value)}
            size="xs"
            rows={2}
            autosize
          />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="subtle" color="gray" onClick={() => setOpened(false)}>
              Annuleer
            </Button>
            <Button size="xs" color="orange" onClick={handleSave} loading={saving}>
              Opslaan
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
