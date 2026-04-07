# Content Flags Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the admin user flag any exercise during a session with a type and optional comment, for later content review.

**Architecture:** New `content_flags` table in the `indonesian` schema, RLS-restricted to row owner. A `contentFlagService` handles DB reads/writes. A `FlagButton` component is injected into `ExerciseShell` and rendered only when `profile.isAdmin === true` — invisible to all other users. No separate route needed initially; flags are reviewed via Supabase Studio or a future admin page.

**Tech Stack:** React, Mantine, Supabase JS v2, TypeScript, Vitest

---

### Task 1: Migration — add `content_flags` table

**Files:**
- Modify: `scripts/migration.sql`

**Step 1: Add table definition**

Add to the end of `scripts/migration.sql`:

```sql
-- Content flags: admin-only exercise review annotations
CREATE TABLE IF NOT EXISTS indonesian.content_flags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_item_id    uuid NOT NULL REFERENCES indonesian.learning_items(id) ON DELETE CASCADE,
  exercise_type       text NOT NULL,
  exercise_variant_id uuid REFERENCES indonesian.exercise_variants(id) ON DELETE SET NULL,
  flag_type           text NOT NULL CHECK (flag_type IN ('wrong_translation', 'bad_sentence', 'confusing', 'sunset', 'other')),
  comment             text,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, learning_item_id, exercise_type)
);

-- RLS: row owner only
ALTER TABLE indonesian.content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "content_flags_owner" ON indonesian.content_flags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.content_flags TO authenticated;

-- Index for listing open flags
CREATE INDEX IF NOT EXISTS idx_content_flags_user_status
  ON indonesian.content_flags(user_id, status);
```

**Step 2: Run migration**

```bash
make migrate
```

Expected: migration runs without error. Verify in Supabase Studio that `indonesian.content_flags` exists.

**Step 3: Commit**

```bash
git add scripts/migration.sql
git commit -m "feat: add content_flags table for admin exercise review"
```

---

### Task 2: Types

**Files:**
- Modify: `src/types/learning.ts`

**Step 1: Add flag types**

Add after the `ExerciseType` definition in `src/types/learning.ts`:

```typescript
export type FlagType = 'wrong_translation' | 'bad_sentence' | 'confusing' | 'sunset' | 'other'
export type FlagStatus = 'open' | 'resolved'

export interface ContentFlag {
  id: string
  userId: string
  learningItemId: string
  exerciseType: ExerciseType
  exerciseVariantId: string | null
  flagType: FlagType
  comment: string | null
  status: FlagStatus
  createdAt: string
  updatedAt: string
}
```

**Step 2: Run type check**

```bash
bun run build 2>&1 | grep -E "error|Error"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/types/learning.ts
git commit -m "feat: add ContentFlag types"
```

---

### Task 3: Service — `contentFlagService`

**Files:**
- Create: `src/services/contentFlagService.ts`
- Create: `src/__tests__/contentFlagService.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/contentFlagService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contentFlagService } from '@/services/contentFlagService'

vi.mock('@/lib/supabase')

describe('contentFlagService', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('upsertFlag calls supabase with correct payload', async () => {
    const { supabase } = await import('@/lib/supabase')
    const mockUpsert = vi.fn().mockResolvedValue({ data: { id: 'flag-1' }, error: null })
    vi.mocked(supabase.schema).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: mockUpsert, select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'flag-1' }, error: null }) }),
    } as any)

    await contentFlagService.upsertFlag({
      userId: 'user-1',
      learningItemId: 'item-1',
      exerciseType: 'recognition_mcq',
      exerciseVariantId: null,
      flagType: 'wrong_translation',
      comment: 'Dutch says X but should say Y',
    })

    expect(supabase.schema).toHaveBeenCalledWith('indonesian')
  })

  it('getFlagForItem returns null when no flag exists', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.schema).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as any)

    const result = await contentFlagService.getFlagForItem('user-1', 'item-1', 'recognition_mcq')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test src/__tests__/contentFlagService.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

**Step 3: Implement the service**

Create `src/services/contentFlagService.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import type { ContentFlag, ExerciseType, FlagType } from '@/types/learning'

interface UpsertFlagInput {
  userId: string
  learningItemId: string
  exerciseType: ExerciseType
  exerciseVariantId: string | null
  flagType: FlagType
  comment: string | null
}

function mapRow(row: Record<string, unknown>): ContentFlag {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    learningItemId: row.learning_item_id as string,
    exerciseType: row.exercise_type as ExerciseType,
    exerciseVariantId: (row.exercise_variant_id as string | null) ?? null,
    flagType: row.flag_type as FlagType,
    comment: (row.comment as string | null) ?? null,
    status: row.status as 'open' | 'resolved',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export const contentFlagService = {
  async upsertFlag(input: UpsertFlagInput): Promise<ContentFlag> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .upsert({
        user_id: input.userId,
        learning_item_id: input.learningItemId,
        exercise_type: input.exerciseType,
        exercise_variant_id: input.exerciseVariantId,
        flag_type: input.flagType,
        comment: input.comment,
        status: 'open',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,learning_item_id,exercise_type' })
      .select()
      .single()

    if (error) throw error
    return mapRow(data)
  },

  async getFlagForItem(
    userId: string,
    learningItemId: string,
    exerciseType: ExerciseType,
  ): Promise<ContentFlag | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .select('*')
      .eq('user_id', userId)
      .eq('learning_item_id', learningItemId)
      .eq('exercise_type', exerciseType)
      .maybeSingle()

    if (error) throw error
    return data ? mapRow(data) : null
  },

  async resolveFlag(flagId: string): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', flagId)

    if (error) throw error
  },

  async getOpenFlags(userId: string): Promise<ContentFlag[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('content_flags')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map(mapRow)
  },
}
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/contentFlagService.test.ts 2>&1 | tail -10
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/contentFlagService.ts src/__tests__/contentFlagService.test.ts
git commit -m "feat: add contentFlagService with upsert, get, resolve"
```

---

### Task 4: FlagButton component

**Files:**
- Create: `src/components/exercises/FlagButton.tsx`

**Step 1: Implement the component**

```tsx
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
```

**Step 2: Run type check and lint**

```bash
bun run build 2>&1 | grep -E "error TS"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/exercises/FlagButton.tsx
git commit -m "feat: add FlagButton component with popover flag panel"
```

---

### Task 5: Wire FlagButton into ExerciseShell

**Files:**
- Modify: `src/components/exercises/ExerciseShell.tsx`

**Step 1: Load existing flag state and render FlagButton**

In `ExerciseShell.tsx`:

1. Import `FlagButton`, `contentFlagService`, `useAuthStore`, and `ContentFlag`.

2. Add state for the current flag, and load it when the exercise mounts:

```typescript
const { profile, user } = useAuthStore()
const [currentFlag, setCurrentFlag] = useState<ContentFlag | null>(null)

// Load existing flag for this exercise on mount
useEffect(() => {
  if (!profile?.isAdmin || !user) return
  contentFlagService
    .getFlagForItem(user.id, exerciseItem.learningItem.id, exerciseItem.exerciseType)
    .then(flag => setCurrentFlag(flag))
    .catch(() => {}) // non-fatal
}, [profile?.isAdmin, user, exerciseItem.learningItem.id, exerciseItem.exerciseType])
```

3. Wrap the returned exercise node in a `Box` with `position: 'relative'` and render `FlagButton` inside it, after the exercise node:

```tsx
if (!profile?.isAdmin || !user) return <>{exerciseNode}</>

return (
  <Box style={{ position: 'relative' }}>
    {exerciseNode}
    <FlagButton
      userId={user.id}
      learningItemId={exerciseItem.learningItem.id}
      exerciseType={exerciseItem.exerciseType}
      exerciseVariantId={exerciseItem.contrastPairData ? exerciseItem.learningItem.id : null}
      existingFlag={currentFlag}
      onFlagged={setCurrentFlag}
    />
  </Box>
)
```

Note: the flag button uses `position: absolute` inside the relative container so it sits in the top-right corner of the exercise card without affecting layout.

Also reset `currentFlag` to `null` when the exercise changes (handled by `ExerciseShell`'s `key` prop in `Session.tsx` — the whole shell re-mounts per exercise, so no extra cleanup needed).

**Step 2: Run full test suite**

```bash
bun run test 2>&1 | tail -10
```

Expected: all tests pass.

**Step 3: Build**

```bash
bun run build 2>&1 | grep -E "error"
```

Expected: clean build.

**Step 4: Commit**

```bash
git add src/components/exercises/ExerciseShell.tsx
git commit -m "feat: wire FlagButton into ExerciseShell for admin users"
```

---

## Supabase Requirements

### Schema changes
- New table `indonesian.content_flags` — see Task 1
- RLS: owner-only (`auth.uid() = user_id`) for all operations
- Grant `SELECT, INSERT, UPDATE, DELETE` to `authenticated`

### homelab-configs changes
- [ ] PostgREST: no new schema exposure needed (`indonesian` already exposed)
- [ ] Kong: no CORS changes needed
- [ ] GoTrue: no auth changes needed
- [ ] Storage: no buckets needed

### Health check additions
- No new checks needed — flags are admin-only and not part of the learner flow
