// scripts/lib/compress-audio.ts
//
// Shrinks RECORDED audio before it is uploaded to Supabase Storage.
//
// Why this exists: every hand-recorded asset was encoded at ~256 kbps STEREO —
// music settings applied to one person talking. Measured 2026-08-02 across
// content/lessons/*.m4a: uniformly 257 kbps, 26-51 MB per lesson. That is
// roughly 4x larger than speech needs, and it had two concrete consequences:
//
//   1. Files exceeded Supabase's 50 MB per-object cap on the free tier, so
//      26 of 30 lessons' grammar audio simply never reached the cloud project.
//   2. Learners on mobile data download ~50 MB for one lesson. Buckets are
//      private, so every play is a fresh signed fetch — it is not cached at a
//      CDN edge the way a public object would be.
//
// 64 kbps mono AAC is transparent for spoken word. Re-encoding lesson 1 gave
// 26.6 MB -> 6.9 MB with no audible difference in Indonesian narration.
//
// THE MONO DOWNMIX IS LOSSLESS HERE — measured, not assumed. Every file is
// DUAL MONO: the L-R difference signal sits at -91.0 dB (digital silence, the
// format's noise floor) against a -6.0 dB peak, across grammar podcasts, lesson
// narration and story podcasts alike. The grammar episodes are two-host
// conversations, but NotebookLM alternates the speakers in TIME rather than
// panning them, so the second channel is a byte-for-byte duplicate.
// `-ac 1` therefore discards pure redundancy and accounts for HALF the total
// saving before bitrate is touched at all. Do not read it as a quality
// compromise; re-measure with
//   ffmpeg -i <f> -af "pan=mono|c0=0.5*c0-0.5*c1,volumedetect" -f null -
// before changing it.
//
// 64 kbps (not lower) is deliberate. General podcast practice tolerates 48 kbps
// for speech, but learners here are attending to PHONETIC detail — the /ŋ/,
// glottal stops and affix boundaries the morphology module teaches. Consonant
// releases and sibilants carry high-frequency energy, which is exactly what low
// bitrates smear first. Owner decision 2026-08-02: keep the headroom; the ~40 MB
// saved across the library is a poor trade against blurring what people pay to
// learn. Also keep 44.1 kHz for the same reason.
//
// NOT used for TTS (scripts/lib/pipeline/lesson-stage/audio.ts). Those objects
// average ~7 KB, and re-encoding already-synthesised speech is a second lossy
// generation for no gain. See memory `project_audio_surfaces` for the full
// four-surface map.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = promisify(execFile)

/** Speech is transparent well below this; see the measurement note above. */
export const DEFAULT_BITRATE_KBPS = 64

/**
 * Skip re-encoding when the source is already at or below this multiple of the
 * target. Re-encoding an already-small file is a pointless second lossy
 * generation, and makes the seeders non-idempotent on re-runs.
 */
const SKIP_THRESHOLD = 1.2

export interface CompressResult {
  buffer: Buffer
  originalBytes: number
  compressedBytes: number
  /** True when the source was already small enough and was passed through untouched. */
  skipped: boolean
  sourceBitrateKbps: number | null
}

export class FfmpegMissingError extends Error {
  constructor() {
    super(
      'ffmpeg/ffprobe not found. Audio compression needs them: `brew install ffmpeg`.\n' +
        'To upload without compressing (not recommended — files may exceed the 50 MB ' +
        'object cap), set SKIP_AUDIO_COMPRESSION=1.',
    )
    this.name = 'FfmpegMissingError'
  }
}

async function ffprobeBitrateKbps(path: string): Promise<number | null> {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=bit_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path,
    ])
    const bps = Number.parseInt(stdout.trim(), 10)
    return Number.isFinite(bps) ? Math.round(bps / 1000) : null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new FfmpegMissingError()
    // A container ffprobe cannot read is not fatal — fall through and compress.
    return null
  }
}

/**
 * Re-encode `path` to mono at `bitrateKbps`, preserving the container so the
 * stored filename, content type and every DB reference stay valid. Returns the
 * ORIGINAL bytes untouched when the source is already small enough.
 *
 * Honours SKIP_AUDIO_COMPRESSION=1 as an escape hatch for environments without
 * ffmpeg — it passes the file through rather than failing the seed.
 */
export async function compressAudioFile(
  path: string,
  opts: { bitrateKbps?: number } = {},
): Promise<CompressResult> {
  const bitrateKbps = opts.bitrateKbps ?? DEFAULT_BITRATE_KBPS
  const originalBytes = (await stat(path)).size

  if (process.env.SKIP_AUDIO_COMPRESSION === '1') {
    return {
      buffer: await readFile(path),
      originalBytes,
      compressedBytes: originalBytes,
      skipped: true,
      sourceBitrateKbps: null,
    }
  }

  const sourceBitrateKbps = await ffprobeBitrateKbps(path)
  if (sourceBitrateKbps !== null && sourceBitrateKbps <= bitrateKbps * SKIP_THRESHOLD) {
    return {
      buffer: await readFile(path),
      originalBytes,
      compressedBytes: originalBytes,
      skipped: true,
      sourceBitrateKbps,
    }
  }

  // Keep the extension: the codec ffmpeg picks follows the container, so .m4a
  // stays AAC and .mp3 stays MP3. Changing it would invalidate audio_path in
  // the DB and every baked content.json URL.
  const ext = path.slice(path.lastIndexOf('.'))
  const out = join(tmpdir(), `kb-compress-${process.pid}-${Date.now()}${ext}`)

  try {
    await run('ffmpeg', [
      '-nostdin',
      '-v', 'error',
      '-y',
      '-i', path,
      '-vn',              // drop cover art; it survives re-encode otherwise and is pure weight
      '-ac', '1',         // mono — one narrator, so the second channel carries nothing
      '-b:a', `${bitrateKbps}k`,
      out,
    ])
    const buffer = await readFile(out)
    return {
      buffer,
      originalBytes,
      compressedBytes: buffer.byteLength,
      skipped: false,
      sourceBitrateKbps,
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new FfmpegMissingError()
    throw err
  } finally {
    await unlink(out).catch(() => {})
  }
}

/** One-line summary for seeder logs. */
export function describeCompression(name: string, r: CompressResult): string {
  const mb = (n: number) => (n / 1e6).toFixed(1)
  if (r.skipped) {
    const why = r.sourceBitrateKbps === null ? 'compression disabled' : `already ${r.sourceBitrateKbps} kbps`
    return `${name}: ${mb(r.originalBytes)} MB (unchanged — ${why})`
  }
  const pct = Math.round((1 - r.compressedBytes / r.originalBytes) * 100)
  return `${name}: ${mb(r.originalBytes)} MB → ${mb(r.compressedBytes)} MB (−${pct}%)`
}
