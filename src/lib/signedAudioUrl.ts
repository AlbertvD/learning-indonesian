// src/lib/signedAudioUrl.ts
//
// All three audio buckets flip public=false at the entitlement-gating cutover
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §4). A signed URL
// is the only way to play audio afterward — storage RLS authorizes the sign,
// not the fetch, so `createSignedUrl(s)` is the one call site every audio
// consumer routes through.
//
// This file owns the ONE thing that's shared across all three: turning a
// STORED reference (a bucket-relative path, or — for the committed lesson
// content.json files baked at fetch-lesson-content.ts time, audit item #2 —
// a full public-storage URL) into {bucket, path}, then signing it. Callers
// that already know their bucket (audioService, lessonService, textService)
// call `createSignedUrl(s)` directly against their own bucket; this helper is
// for the one case that doesn't know its bucket ahead of time: reader pages
// resolving a URL that was baked into static content.json.
//
// useSignedAudioSrc (below) is the React-hook flavor of the same resolution,
// built on a small request-coalescing batch signer: sibling components that
// each call the hook within the same microtask/short tick (e.g. up to 10
// AudioPlayButtons mounted on one vocab-heavy lesson page,
// src/components/lessons/AudioPlayButton.tsx) get folded into ONE
// `createSignedUrls` call per bucket instead of one `createSignedUrl` call
// each. `signStoredAudioUrl` above stays single-shot/unbatched — its
// existing callers (ReaderGrammarAudioBand) don't have the same sibling-burst
// shape and its test suite pins the single-call contract.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'

/** 6h — comfortably outlives any session or reading sitting. */
export const SIGNED_URL_TTL_SECONDS = 21600

const KNOWN_BUCKETS = ['indonesian-lessons', 'indonesian-podcasts', 'indonesian-tts'] as const
export type StoredAudioBucket = (typeof KNOWN_BUCKETS)[number]

export interface StoredAudioLocation {
  bucket: StoredAudioBucket
  path: string
}

function isKnownBucket(bucket: string): bucket is StoredAudioBucket {
  return (KNOWN_BUCKETS as readonly string[]).includes(bucket)
}

/**
 * Strips a stored audio reference down to {bucket, path}. Handles two shapes:
 * a full public-storage URL (`.../storage/v1/object/public/<bucket>/<path>`)
 * and an already bucket-relative path (`<bucket>/<path>`). Returns null for
 * anything that doesn't resolve to one of the three app buckets — a signal
 * to the caller that the stored data is malformed, not that the user lacks
 * access (that's a signing error, handled separately).
 */
export function parseStoredAudioUrl(url: string): StoredAudioLocation | null {
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (publicMatch) {
    const [, bucket, path] = publicMatch
    return isKnownBucket(bucket) && path ? { bucket, path } : null
  }

  const slashIndex = url.indexOf('/')
  if (slashIndex <= 0) return null
  const bucket = url.slice(0, slashIndex)
  const path = url.slice(slashIndex + 1)
  return isKnownBucket(bucket) && path ? { bucket, path } : null
}

/**
 * Resolves a stored audio reference to a playable signed URL. Null on
 * anything unparseable (logged — malformed data is a pipeline bug) or a
 * signing failure (NOT logged — a non-entitled user or a missing object is
 * an expected outcome, not a bug; callers already treat a null/undefined URL
 * as "no audio" via their existing absent-audio state).
 */
export async function signStoredAudioUrl(storedUrl: string): Promise<string | null> {
  const location = parseStoredAudioUrl(storedUrl)
  if (!location) {
    logError({
      page: 'signed-audio-url',
      action: 'parseStoredAudioUrl',
      error: new Error(`Unrecognized stored audio reference: ${storedUrl}`),
    })
    return null
  }

  const { data, error } = await supabase.storage
    .from(location.bucket)
    .createSignedUrl(location.path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

// ─── Request-coalescing batch signer (useSignedAudioSrc) ───────────────────
//
// Module-level (not per-hook-instance) queue, keyed by bucket, so unrelated
// components mounted in the same tick still coalesce. A request joins the
// queue and schedules a microtask flush if one isn't already pending; React
// runs every sibling component's passive effects synchronously within one
// commit, so by the time the FIRST scheduled microtask actually runs, every
// sibling's request for that tick has already joined the same queue.
const pendingByBucket = new Map<StoredAudioBucket, Map<string, Array<(url: string | null) => void>>>()
const scheduledBuckets = new Set<StoredAudioBucket>()

async function flushBucket(bucket: StoredAudioBucket): Promise<void> {
  const queue = pendingByBucket.get(bucket)
  pendingByBucket.delete(bucket)
  if (!queue || queue.size === 0) return

  const paths = [...queue.keys()]
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    // Wholesale batch failure (network/plumbing) — logged, mirroring
    // audioService.fetchSessionAudioMap's same-shaped batch call. Per-path
    // failures below are NOT logged (non-entitled user, missing object —
    // expected, not a bug).
    logError({ page: 'signed-audio-url', action: 'createSignedUrls', error: error ?? new Error('no data returned') })
    for (const resolvers of queue.values()) {
      for (const resolve of resolvers) resolve(null)
    }
    return
  }

  const urlByPath = new Map<string, string | null>()
  for (const row of data) {
    if (row.path) urlByPath.set(row.path, row.error ? null : row.signedUrl)
  }
  for (const [path, resolvers] of queue) {
    const url = urlByPath.get(path) ?? null
    for (const resolve of resolvers) resolve(url)
  }
}

function requestSignedUrl(bucket: StoredAudioBucket, path: string): Promise<string | null> {
  return new Promise((resolve) => {
    let queue = pendingByBucket.get(bucket)
    if (!queue) {
      queue = new Map()
      pendingByBucket.set(bucket, queue)
    }
    const resolvers = queue.get(path)
    if (resolvers) {
      resolvers.push(resolve)
    } else {
      queue.set(path, [resolve])
    }
    if (!scheduledBuckets.has(bucket)) {
      scheduledBuckets.add(bucket)
      queueMicrotask(() => {
        scheduledBuckets.delete(bucket)
        void flushBucket(bucket)
      })
    }
  })
}

/**
 * React-hook flavor of `signStoredAudioUrl`: resolves a stored audio
 * reference to a signed URL, batching same-tick sibling requests per bucket
 * (see module comment above). Returns null while unresolved, on an
 * unparseable reference (logged), or on a signing failure (not logged —
 * expected for a non-entitled user). Guards against setting state after
 * unmount the same way the pre-extraction inline PlayButton did.
 */
export function useSignedAudioSrc(src: string | undefined): string | null {
  const [signedSrc, setSignedSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!src) {
      setSignedSrc(null)
      return
    }
    const location = parseStoredAudioUrl(src)
    if (!location) {
      logError({
        page: 'signed-audio-url',
        action: 'parseStoredAudioUrl',
        error: new Error(`Unrecognized stored audio reference: ${src}`),
      })
      setSignedSrc(null)
      return
    }
    requestSignedUrl(location.bucket, location.path).then((url) => {
      if (!cancelled) setSignedSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  return signedSrc
}
