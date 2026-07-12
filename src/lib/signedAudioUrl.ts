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
