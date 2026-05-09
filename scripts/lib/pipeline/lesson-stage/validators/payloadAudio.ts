import type { ValidationFinding } from '../model'

interface PageBlockLike {
  block_key: string
  payload_json: Record<string, unknown> | null | undefined
}

/**
 * GT3 — No `lesson_page_blocks.payload_json` written by the pipeline contains
 * `audioUrl` or `audio_url` keys (Item 3a). Per-text audio resolves through
 * the `audio_clips` table, keyed by `(normalized_text, voice_id)`. Inline
 * payload audio is duplication.
 *
 * Walks the payload recursively so dialogue lines and other nested shapes
 * can't sneak audio fields past the gate.
 */
export function validatePayloadAudio(blocks: PageBlockLike[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const block of blocks) {
    if (!block.payload_json) continue
    const offending = collectOffendingKeys(block.payload_json)
    if (offending.length > 0) {
      findings.push({
        gate: 'GT3',
        severity: 'error',
        message: `Page-block payload contains forbidden key(s): ${offending.join(', ')}`,
        context: { blockKey: block.block_key },
      })
    }
  }

  return findings
}

function collectOffendingKeys(value: unknown): string[] {
  const found = new Set<string>()
  walk(value, found)
  return [...found]
}

function walk(value: unknown, found: Set<string>): void {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found)
    return
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'audioUrl' || key === 'audio_url') {
        found.add(key)
      }
      walk(child, found)
    }
  }
}
