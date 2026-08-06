// Guards the two behaviours the seeders depend on:
//   1. an already-small file is passed through UNTOUCHED (so re-running a
//      seeder does not stack lossy generations on top of each other), and
//   2. an oversized file actually shrinks.
//
// Uses real ffmpeg-generated audio rather than mocks — the value of this helper
// is entirely in what ffmpeg does, so a mocked ffmpeg would test nothing. The
// suite skips itself when ffmpeg is absent rather than failing, since CI images
// and fresh checkouts will not have it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compressAudioFile, describeCompression, DEFAULT_BITRATE_KBPS } from '../compress-audio'

const run = promisify(execFile)

let dir: string
let hasFfmpeg = false

async function synth(path: string, bitrateKbps: number, channels: number, seconds = 5) {
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-ac', String(channels), '-b:a', `${bitrateKbps}k`,
    path,
  ])
}

beforeAll(async () => {
  try {
    await run('ffmpeg', ['-version'])
    await run('ffprobe', ['-version'])
    hasFfmpeg = true
  } catch {
    hasFfmpeg = false
    return
  }
  dir = await mkdtemp(join(tmpdir(), 'kb-compress-test-'))
})

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('compressAudioFile', () => {
  it('shrinks a high-bitrate stereo source', async () => {
    if (!hasFfmpeg) return
    const src = join(dir, 'loud.m4a')
    await synth(src, 256, 2)

    const result = await compressAudioFile(src)

    expect(result.skipped).toBe(false)
    expect(result.compressedBytes).toBeLessThan(result.originalBytes)
    // The file on disk must NOT be touched — seeders re-read the master.
    expect((await stat(src)).size).toBe(result.originalBytes)
  })

  // The idempotency guard. Without it, seeding twice re-encodes an already
  // 64 kbps upload down again, compounding artefacts each run.
  it('passes an already-low-bitrate file through untouched', async () => {
    if (!hasFfmpeg) return
    const src = join(dir, 'quiet.m4a')
    await synth(src, 48, 1)

    const result = await compressAudioFile(src)

    expect(result.skipped).toBe(true)
    expect(result.compressedBytes).toBe(result.originalBytes)
    expect(result.sourceBitrateKbps).not.toBeNull()
    expect(result.sourceBitrateKbps!).toBeLessThanOrEqual(DEFAULT_BITRATE_KBPS * 1.2)
  })

  it('honours SKIP_AUDIO_COMPRESSION as an escape hatch', async () => {
    if (!hasFfmpeg) return
    const src = join(dir, 'skipme.m4a')
    await synth(src, 256, 2)

    process.env.SKIP_AUDIO_COMPRESSION = '1'
    try {
      const result = await compressAudioFile(src)
      expect(result.skipped).toBe(true)
      expect(result.compressedBytes).toBe(result.originalBytes)
    } finally {
      delete process.env.SKIP_AUDIO_COMPRESSION
    }
  })

  it('reports a percentage saved, and says why when it skipped', () => {
    const shrunk = describeCompression('a.m4a', {
      buffer: Buffer.alloc(0), originalBytes: 10_000_000, compressedBytes: 2_500_000,
      skipped: false, sourceBitrateKbps: 256,
    })
    expect(shrunk).toContain('−75%')

    const passed = describeCompression('b.m4a', {
      buffer: Buffer.alloc(0), originalBytes: 1_000_000, compressedBytes: 1_000_000,
      skipped: true, sourceBitrateKbps: 48,
    })
    expect(passed).toContain('already 48 kbps')
  })
})
