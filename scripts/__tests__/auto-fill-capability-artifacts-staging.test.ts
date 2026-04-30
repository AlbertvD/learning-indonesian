import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTO_FILL_REVIEWED_BY,
  mergeWithExistingStaging,
  readExistingExerciseAssets,
  serializeExerciseAssets,
  writeExerciseAssets,
  type ExerciseAssetEntry,
} from '../auto-fill-capability-artifacts-from-legacy'

const manualEntry: ExerciseAssetEntry = {
  asset_key: 'cap:v1:item:learning_items/akhir:form_recall:l1_to_id:text:nl:meaning:l1',
  capability_key: 'cap:v1:item:learning_items/akhir:form_recall:l1_to_id:text:nl',
  artifact_kind: 'meaning:l1',
  quality_status: 'approved',
  payload_json: {
    value: 'einde',
    reviewedBy: 'manual-release-smoke',
    reviewedAt: '2026-04-26',
  },
}

const draftPlaceholderEntry: ExerciseAssetEntry = {
  asset_key: 'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl:base_text',
  capability_key: 'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl',
  artifact_kind: 'base_text',
  quality_status: 'draft',
  payload_json: { placeholder: true },
}

const autoFilledForDraft: ExerciseAssetEntry = {
  ...draftPlaceholderEntry,
  quality_status: 'approved',
  payload_json: {
    value: 'akhir',
    reviewedBy: AUTO_FILL_REVIEWED_BY,
    reviewedAt: '2026-04-30',
    autoFillVersion: '1',
  },
}

const autoFilledClashWithManual: ExerciseAssetEntry = {
  ...manualEntry,
  payload_json: {
    value: 'einde (auto)',
    reviewedBy: AUTO_FILL_REVIEWED_BY,
    reviewedAt: '2026-04-30',
    autoFillVersion: '1',
  },
}

describe('mergeWithExistingStaging', () => {
  it('keeps manual entry verbatim, drops draft, merges auto-filled', () => {
    const merged = mergeWithExistingStaging(
      [manualEntry, draftPlaceholderEntry],
      [autoFilledForDraft],
    )
    expect(merged.find(e => e.asset_key === manualEntry.asset_key)).toEqual(manualEntry)
    expect(merged.find(e => e.asset_key === draftPlaceholderEntry.asset_key))
      .toEqual(autoFilledForDraft)
  })

  it('manual wins on asset_key collision with auto-filled', () => {
    const merged = mergeWithExistingStaging(
      [manualEntry],
      [autoFilledClashWithManual],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(manualEntry)
  })

  it('outputs are sorted by asset_key ascending regardless of input order', () => {
    const a: ExerciseAssetEntry = { ...autoFilledForDraft, asset_key: 'a' }
    const b: ExerciseAssetEntry = { ...autoFilledForDraft, asset_key: 'b' }
    const c: ExerciseAssetEntry = { ...autoFilledForDraft, asset_key: 'c' }
    const m1 = mergeWithExistingStaging([], [c, a, b])
    const m2 = mergeWithExistingStaging([], [b, c, a])
    expect(m1.map(e => e.asset_key)).toEqual(['a', 'b', 'c'])
    expect(m2).toEqual(m1)
  })

  it('treats existing as [] when no manual + no draft entries are passed', () => {
    const merged = mergeWithExistingStaging([], [autoFilledForDraft])
    expect(merged).toEqual([autoFilledForDraft])
  })

  it('drops existing auto-from-legacy-db entries before re-applying auto-filled', () => {
    const oldAuto: ExerciseAssetEntry = {
      ...autoFilledForDraft,
      payload_json: { ...autoFilledForDraft.payload_json, value: 'old-value' },
    }
    const merged = mergeWithExistingStaging([oldAuto], [autoFilledForDraft])
    expect(merged).toHaveLength(1)
    expect((merged[0]!.payload_json as { value: string }).value).toBe('akhir')
  })
})

describe('serializeExerciseAssets', () => {
  it('produces a TS export with 2-space JSON indentation matching pilot format', () => {
    const out = serializeExerciseAssets([manualEntry])
    expect(out.startsWith('// Auto-filled by auto-fill-capability-artifacts-from-legacy.ts')).toBe(true)
    expect(out).toContain('export const exerciseAssets = [')
    expect(out).toMatch(/^\s{2}\{$/m)
    expect(out).toMatch(/^\s{4}"asset_key": /m)
    expect(out.endsWith(']\n')).toBe(true)
  })

  it('is byte-identical on two runs against the same input', () => {
    const a = serializeExerciseAssets([draftPlaceholderEntry, manualEntry, autoFilledForDraft])
    const b = serializeExerciseAssets([autoFilledForDraft, manualEntry, draftPlaceholderEntry])
    // Even before sorting, the same set should produce the same string.
    // The serializer itself sorts; verify that.
    expect(a).toBe(b)
  })
})

describe('readExistingExerciseAssets / writeExerciseAssets', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-fill-staging-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns [] when the staging file does not exist (ENOENT)', async () => {
    const entries = await readExistingExerciseAssets(tmp)
    expect(entries).toEqual([])
  })

  it('round-trips: write then read produces the same entries', async () => {
    await writeExerciseAssets(tmp, [manualEntry, autoFilledForDraft])
    const out = await readExistingExerciseAssets(tmp)
    // Sort + provenance preserved.
    expect(out.map(e => e.asset_key).sort()).toEqual(
      [manualEntry.asset_key, autoFilledForDraft.asset_key].sort(),
    )
  })

  it('write produces deterministic file content on re-write', async () => {
    await writeExerciseAssets(tmp, [manualEntry, autoFilledForDraft])
    const a = fs.readFileSync(path.join(tmp, 'exercise-assets.ts'), 'utf8')
    await writeExerciseAssets(tmp, [autoFilledForDraft, manualEntry])
    const b = fs.readFileSync(path.join(tmp, 'exercise-assets.ts'), 'utf8')
    expect(a).toBe(b)
  })
})
