#!/usr/bin/env bun
// scripts/check-supabase.ts
// Run with: make check-supabase (or: NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase.ts)
// Requires: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in environment (or .env.local)
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (check .env.local)')
  process.exit(1)
}

// Local dev origin — this is what the browser sends in CORS preflight
const DEV_ORIGIN = 'http://localhost:5173'

const results: { label: string; ok: boolean; warn?: boolean; detail?: string }[] = []

function pass(label: string) {
  results.push({ label, ok: true })
}

function fail(label: string, detail: string) {
  results.push({ label, ok: false, detail })
}

// results[].warn is read by the output loop below for the non-blocking
// warning display; no producer currently sets it (the one check that did,
// the public-signup-gate probe, was deleted 2026-07-12 — open signup is now
// the designed state, see Check 4b's removal note). Left as general-purpose
// result-shape plumbing for a future WARNING-level check.

// ── Check 1: API reachability ─────────────────────────────────────────────
// REACHABILITY, not authorization. The old test required HTTP 200 from
// `/rest/v1/`, which is a self-hosted assumption: our Kong lets an anon key
// read the PostgREST OpenAPI root, but MANAGED Supabase returns 401 there
// regardless of headers (verified 2026-07-30: 401 with apikey, and with
// apikey + Authorization: Bearer). That made this check fail on cloud while
// the API was demonstrably fine — every other check in this file was passing
// against the same host.
//
// Any HTTP response below 500 proves the gateway is up and routing: a 401 is
// the API answering, just declining. The failure modes actually worth
// catching — DNS gone, Traefik/Kong down, stack not running — surface as a
// connection error or a 5xx, both still caught below.
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (res.status < 500) {
    pass('API reachable')
  } else {
    fail('API reachable', `HTTP ${res.status} — gateway up but erroring; check Supabase stack status`)
  }
} catch (err) {
  fail('API reachable', `Connection failed: ${(err as Error).message} — check DNS and Traefik`)
}

// ── Check 2: CORS headers ─────────────────────────────────────────────────
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'OPTIONS',
    headers: {
      Origin: DEV_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'apikey,authorization,content-type,accept-profile,content-profile',
      apikey: ANON_KEY,
    },
  })
  const allowOrigin = res.headers.get('access-control-allow-origin')
  const allowHeaders = res.headers.get('access-control-allow-headers') ?? ''
  const missingHeaders: string[] = []
  for (const h of ['accept-profile', 'content-profile']) {
    if (!allowHeaders.toLowerCase().includes(h)) missingHeaders.push(h)
  }
  if (!allowOrigin) {
    fail('CORS headers', `access-control-allow-origin missing — add ${DEV_ORIGIN} to Kong CORS origins in homelab-configs/services/supabase/kong/kong.yml and rebuild Kong image`)
  } else if (missingHeaders.length > 0) {
    fail('CORS headers', `Missing headers in access-control-allow-headers: ${missingHeaders.join(', ')} — edit Kong CORS config in homelab-configs`)
  } else {
    pass('CORS headers (Accept-Profile, Content-Profile present)')
  }
} catch (err) {
  fail('CORS headers', `Request failed: ${(err as Error).message}`)
}

// ── Check 3: indonesian schema exposure ──────────────────────────────────
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/lessons?limit=0`, {
    headers: {
      apikey: ANON_KEY,
      'Accept-Profile': 'indonesian',
    },
  })
  if (res.status === 406) {
    fail('Schema exposure (indonesian)', `HTTP 406 — add 'indonesian' to PGRST_DB_SCHEMAS in homelab-configs/services/supabase/docker-compose.yml and restart PostgREST`)
  } else if (res.status === 404) {
    fail('Schema exposure (indonesian)', `HTTP 404 — schema exposed but 'lessons' table missing, run: make migrate SUPABASE_SERVICE_KEY=<key>`)
  } else if (res.ok || res.status === 200) {
    pass('Schema exposure (indonesian)')
  } else {
    // A permission-denied (PostgREST 42501) still PROVES the schema is
    // exposed: PostgREST had to resolve indonesian.lessons in order to refuse
    // access to it. An unexposed schema fails earlier, with the 406 handled
    // above.
    //
    // This matters on managed Supabase, where `anon` holds no grants on the
    // content tables at all, so this probe 401s where the homelab returns 200.
    // The homelab difference is grant DRIFT, not design: it carries SELECT
    // grants to `anon` on 7 indonesian tables that migration.sql never
    // declares. Verified harmless there — RLS is enabled on all 7 and no
    // policy admits anon or public, so anon receives an empty set either way —
    // but CLOUD (zero anon grants) is the tighter, intended posture, and this
    // check must not report the tighter configuration as a failure.
    const body = await res.text()
    if (/42501|permission denied/i.test(body)) {
      pass('Schema exposure (indonesian) — exposed; anon correctly has no read grant')
    } else {
      fail('Schema exposure (indonesian)', `HTTP ${res.status}: ${body}`)
    }
  }
} catch (err) {
  fail('Schema exposure (indonesian)', `Request failed: ${(err as Error).message}`)
}

// ── Check 4: Auth endpoint ────────────────────────────────────────────────
// The apikey header is REQUIRED on managed Supabase — /auth/v1/health returns
// 401 without it there, while self-hosted Kong serves it unauthenticated
// (verified both, 2026-07-30). Sending it satisfies both: homelab ignores the
// header, cloud requires it.
try {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: ANON_KEY },
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok && (body as any).healthy !== false) {
    pass('Auth endpoint (GoTrue healthy)')
  } else {
    fail('Auth endpoint', `GoTrue unhealthy (HTTP ${res.status}) — check GoTrue container`)
  }
} catch (err) {
  fail('Auth endpoint', `Request failed: ${(err as Error).message}`)
}

// ── Check 4b: (removed) ─────────────────────────────────────────────────
// Open signup + payment-as-the-gate is the designed state since the
// 2026-07-12 entitlement design (§2 "Invite gate: dropped entirely — payment
// is the gate"; GOTRUE_DISABLE_SIGNUP=false). The old probe here predated
// that flip, asserted the OPPOSITE of the current design (it warned when
// supabase.auth.signUp succeeded), and minted a real throwaway auth.users
// row on every run. Deleted rather than inverted — there is no invariant
// left to probe: the public signup endpoint being open is correct, not a
// misconfiguration to detect.

// ── Checks 5–7: Storage buckets are private (anon probe) ──────────────────
// All 3 buckets flip public=false as part of the entitlement DB slice
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §4).
//
// ⚠ FIXED 2026-07-30 — this probe used to request `__nonexistent__` and treat
// 400/404 as proof of privacy. That reasoning only holds one way. A PUBLIC
// bucket ALSO returns 400 for a missing object, so the check passed against
// the homelab, whose buckets are `public=true` to this day — while the very
// same path with a REAL object returned 200, i.e. world-readable. It reported
// the paywall's storage gate as verified without testing it.
//
// The probe now requests a REAL object. If the bucket were public, this would
// return 200; anything else means the /object/public/ route refused it, which
// is what private actually looks like. Each path is a stable, long-lived
// object present in both environments; if one is ever removed the check turns
// into a false PASS again, so keep them in step with the seeded content.
//
// The structural service-key assertion (storage.buckets.public=false ×3) lives
// in check-supabase-deep.ts per the spec's split-by-key rule (§8): a
// service-key check here would carry BYPASSRLS and prove nothing about the
// public flag either way. That one is authoritative; this one is the
// functional cross-check from the anon side.
const PRIVACY_PROBE_PATHS: Record<string, string> = {
  'indonesian-lessons': 'grammar/lesson-3-nl.mp3',
  'indonesian-podcasts': 'podcasts/pronunciation-nl.mp3',
  'indonesian-tts': 'tts/sulafat/apa-itu-fd336700.mp3',
}
for (const bucket of ['indonesian-lessons', 'indonesian-podcasts', 'indonesian-tts']) {
  try {
    const probePath = PRIVACY_PROBE_PATHS[bucket]
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/${probePath}`)
    if (res.status === 200) {
      fail(
        `Storage bucket private: ${bucket}`,
        `A REAL object (${probePath}) is readable unauthenticated (HTTP 200) — the bucket is public=true and the paywall's storage gate is open; run: make migrate SUPABASE_SERVICE_KEY=<key>`,
      )
    } else if (res.status === 400 || res.status === 404 || res.status === 401 || res.status === 403) {
      pass(`Storage bucket private: ${bucket} (real object refused → HTTP ${res.status})`)
    } else {
      fail(`Storage bucket private: ${bucket}`, `Unexpected HTTP ${res.status} on unauthenticated public-object probe`)
    }
  } catch (err) {
    fail(`Storage bucket private: ${bucket}`, `Request failed: ${(err as Error).message}`)
  }
}

// ── Check: stripe-webhook rejects unsigned requests ────────────────────────
// Deployed via SCP + edge-functions container restart, not this DB slice
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.2/§7). An
// unsigned POST (no stripe-signature header) must be rejected 400 by the
// function's constructEventAsync verification step before reaching any
// handler logic.
try {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'probe.unsigned' }),
  })
  if (res.status === 400) {
    pass('stripe-webhook rejects unsigned POST (HTTP 400)')
  } else if (res.status === 404) {
    fail('stripe-webhook rejects unsigned POST', 'HTTP 404 — function not deployed yet (expected until the entitlement rollout window, spec §7); SCP supabase/functions/stripe-webhook/index.ts to the homelab bind mount and restart supabase-edge-functions')
  } else {
    fail('stripe-webhook rejects unsigned POST', `Unexpected HTTP ${res.status} — signature verification may be missing or misconfigured`)
  }
} catch (err) {
  fail('stripe-webhook rejects unsigned POST', `Request failed: ${(err as Error).message}`)
}

// ── Checks 7–9: Table reads (anon key via authenticated session) ──────────
// These use an authenticated supabase client because tables require `authenticated` role.
// We sign in anonymously — GoTrue auto-confirms with GOTRUE_MAILER_AUTOCONFIRM=true.
// If there's no test user, these checks are skipped with a warning.
const TEST_EMAIL = process.env.CHECK_TEST_EMAIL
const TEST_PASSWORD = process.env.CHECK_TEST_PASSWORD

const supabase = createClient(SUPABASE_URL, ANON_KEY)

let authed = false
if (TEST_EMAIL && TEST_PASSWORD) {
  const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (error) {
    fail('Auth sign-in (for table reads)', `Sign-in failed: ${error.message} — check CHECK_TEST_EMAIL / CHECK_TEST_PASSWORD`)
  } else {
    authed = true
  }
} else {
  results.push({ label: 'Table reads (skipped — no CHECK_TEST_EMAIL/CHECK_TEST_PASSWORD set)', ok: true })
}

if (authed) {
  for (const table of ['lessons', 'vocabulary', 'texts']) {
    const { error } = await supabase.schema('indonesian').from(table).select('id').limit(1)
    if (error) {
      fail(`${table} readable (authenticated)`, `${error.message} — check RLS policies and grants in migration.sql, run: make migrate SUPABASE_SERVICE_KEY=<key>`)
    } else {
      pass(`${table} readable (authenticated)`)
    }
  }

  // get_lessons_overview, called as the AUTHENTICATED test user (not
  // service_role). The lesson tile's % mastered numerator runs through an
  // RLS-gated join into learner_capability_state (owner-only). Calling under the
  // invoker path proves the join returns the owner's rows and the two-sources
  // return shape is live. A silent RLS-deny would surface here as an error or a
  // wrong shape. See ADR 0015 / lesson-status two-sources spec §Testing 5.
  {
    const { data: authUser } = await supabase.auth.getUser()
    const uid = authUser.user?.id
    const { data: rows, error } = await supabase.schema('indonesian').rpc('get_lessons_overview', { p_user_id: uid })
    const arr = (rows ?? []) as Array<Record<string, unknown>>
    if (error) {
      fail('get_lessons_overview (authenticated invoker path)', `${error.message} — RLS/grant regression on learner_capability_state or the RPC; run: make migrate SUPABASE_SERVICE_KEY=<key>`)
    } else if (arr.length === 0) {
      fail('get_lessons_overview (authenticated invoker path)', 'returned no rows — expected one per published lesson')
    } else {
      const r0 = arr[0]
      const shapeOk = 'is_activated' in r0 && 'mastered_capability_count' in r0 && 'ready_capability_count' in r0
        && !('has_started_lesson' in r0) && !('practiced_eligible_capability_count' in r0)
      const coherent = arr.every(r =>
        Number(r.mastered_capability_count) >= 0
        && Number(r.mastered_capability_count) <= Number(r.ready_capability_count))
      if (!shapeOk) {
        fail('get_lessons_overview return shape (two-sources)', 'expected is_activated + mastered_capability_count, no has_started_lesson/practiced_eligible_capability_count — run: make migrate SUPABASE_SERVICE_KEY=<key>')
      } else if (!coherent) {
        fail('get_lessons_overview coherence', 'mastered_capability_count outside [0, ready_capability_count] for some lesson')
      } else {
        const mastered = arr.reduce((s, r) => s + Number(r.mastered_capability_count), 0)
        const ready = arr.reduce((s, r) => s + Number(r.ready_capability_count), 0)
        // The mastered/ready totals are printed so a human can confirm the
        // authenticated invoker path returns non-zero mastery (the RLS-zeroing signal).
        pass(`get_lessons_overview (authenticated two-sources shape; ${mastered}/${ready} mastered across ${arr.length} lessons)`)
      }
    }
  }

  // get_practice_time (#206), authenticated invoker path. Proves the Practice
  // Time RPC is live, grant-correct, and returns the { minutes_this_week } shape
  // the analytics.engagement module reads.
  {
    const { data: authUser } = await supabase.auth.getUser()
    const uid = authUser.user?.id
    const { data, error } = await supabase
      .schema('indonesian')
      .rpc('get_practice_time', { p_user_id: uid, p_timezone: 'Europe/Amsterdam' })
    const row = (data ?? {}) as Record<string, unknown>
    if (error) {
      fail('get_practice_time (authenticated invoker path)', `${error.message} — missing function/grant; run: make migrate SUPABASE_SERVICE_KEY=<key>`)
    } else if (!('minutes_this_week' in row) || typeof row.minutes_this_week !== 'number') {
      fail('get_practice_time return shape', 'expected { minutes_this_week: number } — run: make migrate SUPABASE_SERVICE_KEY=<key>')
    } else {
      pass(`get_practice_time (authenticated; ${row.minutes_this_week} min this week)`)
    }
  }

  // Check lesson audio URLs are accessible
  const { data: lessons, error: lessonErr } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('title, audio_path')
    .not('audio_path', 'is', null)

  if (lessonErr) {
    fail('Lesson audio URLs accessible', lessonErr.message)
  } else if (!lessons || lessons.length === 0) {
    fail('Lesson audio URLs accessible', 'No lessons with audio found — run: make seed-lessons && make seed-lesson-audio SUPABASE_SERVICE_KEY=<key>')
  } else {
    for (const lesson of lessons as { title: string; audio_path: string }[]) {
      const { data } = supabase.storage.from('indonesian-lessons').getPublicUrl(lesson.audio_path)
      try {
        const res = await fetch(data.publicUrl, { method: 'HEAD' })
        if (res.ok) {
          pass(`Audio URL accessible: ${lesson.audio_path}`)
        } else {
          fail(`Audio URL accessible: ${lesson.audio_path}`, `HTTP ${res.status} — run: make seed-lesson-audio SUPABASE_SERVICE_KEY=<key>`)
        }
      } catch (err) {
        fail(`Audio URL accessible: ${lesson.audio_path}`, `Request failed: ${(err as Error).message}`)
      }
    }
  }
  // ── Entitlement RLS probes (2026-07-12 entitlement design §8, reworked
  //    2026-07-12 for the TTS-free-for-authenticated amendment §4/§10)  ────
  // Anon key + REAL signed-in test users — the service-key client in
  // check-supabase-deep.ts carries BYPASSRLS and would sign ANY path
  // regardless of the storage/RPC policy (the b38e467f false-green class).
  // CHECK_TEST_EMAIL is comped via the §6 migration backfill (existing
  // preview users → source='comp'), so the `supabase` client already signed
  // in above IS the comped probe. A second, dedicated non-entitled account
  // (never comped, no Stripe subscription) proves the DENY path.
  //
  // The entire indonesian-tts bucket is now free for any AUTHENTICATED user
  // (spec §4 amendment), so the paid/free-TTS distinction this block used to
  // probe no longer exists — a non-entitled probe is EXPECTED to sign any
  // TTS clip. The load-bearing paid-audio deny probe moves to
  // indonesian-lessons (a lesson beyond the free tier's audio_path); the TTS
  // probe now asserts the free-for-authenticated grant instead of a deny.
  //
  // NOTE: this fails against a not-yet-migrated DB (entitlements/can_read_media/
  // the set_lesson_activation gate don't exist yet) — expected until the
  // coordinated rollout, spec §7.
  const NONENTITLED_EMAIL = process.env.CHECK_TEST_NONENTITLED_EMAIL
  const NONENTITLED_PASSWORD = process.env.CHECK_TEST_NONENTITLED_PASSWORD
  if (!NONENTITLED_EMAIL || !NONENTITLED_PASSWORD) {
    results.push({ label: 'Entitlement RLS probes (skipped — no CHECK_TEST_NONENTITLED_EMAIL/CHECK_TEST_NONENTITLED_PASSWORD set)', ok: true })
  } else {
    const nonentitled = createClient(SUPABASE_URL, ANON_KEY)
    const { error: neSignInErr } = await nonentitled.auth.signInWithPassword({ email: NONENTITLED_EMAIL, password: NONENTITLED_PASSWORD })
    if (neSignInErr) {
      fail('Entitlement RLS probes — non-entitled sign-in', `${neSignInErr.message} — check CHECK_TEST_NONENTITLED_EMAIL/CHECK_TEST_NONENTITLED_PASSWORD`)
    } else {
      try {
        // A paid (order_index>3) lesson with audio — the load-bearing
        // paid-media probe now that TTS is free-for-authenticated — plus any
        // TTS clip to prove the free-for-authenticated bucket grant.
        const { data: lessonRows, error: lessonErr } = await supabase
          .schema('indonesian').from('lessons').select('id, order_index, audio_path')
          .not('audio_path', 'is', null)
        if (lessonErr) throw new Error(`lessons lookup: ${lessonErr.message}`)
        const allLessons = (lessonRows ?? []) as { id: string; order_index: number; audio_path: string }[]
        const paidLesson = allLessons.find(l => l.order_index > 3)

        const { data: anyClipRows, error: clipErr } = await supabase
          .schema('indonesian').from('audio_clips').select('storage_path').limit(1)
        if (clipErr) throw new Error(`TTS clip lookup: ${clipErr.message}`)
        const anyClip = (anyClipRows ?? [])[0] as { storage_path: string } | undefined

        if (!paidLesson || !anyClip) {
          fail('Entitlement RLS probes — fixture', 'no paid (order_index>3) lesson with audio / TTS clip found to probe against')
        } else {
          const { data: compedSigned, error: compedErr } = await supabase.storage
            .from('indonesian-lessons').createSignedUrl(paidLesson.audio_path, 60)
          if (compedErr || !compedSigned?.signedUrl) {
            fail('Comped test user can sign a paid lesson audio clip', compedErr?.message ?? 'no signedUrl returned')
          } else {
            pass('Comped test user can sign a paid lesson audio clip')
          }

          const { data: neDeniedSigned, error: neDeniedErr } = await nonentitled.storage
            .from('indonesian-lessons').createSignedUrl(paidLesson.audio_path, 60)
          if (!neDeniedErr && neDeniedSigned?.signedUrl) {
            fail('Non-entitled probe cannot sign a paid lesson audio clip', 'signing succeeded — indonesian_media_read policy is not gating the indonesian-lessons bucket')
          } else {
            pass('Non-entitled probe cannot sign a paid lesson audio clip')
          }

          const { data: neTtsSigned, error: neTtsErr } = await nonentitled.storage
            .from('indonesian-tts').createSignedUrl(anyClip.storage_path, 60)
          if (neTtsErr || !neTtsSigned?.signedUrl) {
            fail('Non-entitled probe can sign any TTS clip (bucket is free-for-authenticated)', neTtsErr?.message ?? 'no signedUrl returned')
          } else {
            pass('Non-entitled probe can sign any TTS clip (bucket is free-for-authenticated)')
          }

          const { data: neUser } = await nonentitled.auth.getUser()
          const neUid = neUser.user?.id
          const { error: activationErr } = await nonentitled
            .schema('indonesian').rpc('set_lesson_activation', { p_user_id: neUid, p_lesson_id: paidLesson.id, p_activated: true })
          if (!activationErr) {
            fail('set_lesson_activation raises entitlement_required for non-entitled probe', 'RPC succeeded — the entitlement gate in set_lesson_activation is missing or misordered')
          } else if (!activationErr.message.includes('entitlement_required')) {
            fail('set_lesson_activation raises entitlement_required for non-entitled probe', `raised a different error: ${activationErr.message}`)
          } else {
            pass('set_lesson_activation raises entitlement_required for non-entitled probe')
          }
        }
      } catch (err) {
        fail('Entitlement RLS probes', (err as Error).message)
      }
    }
  }
}

// ── Output ────────────────────────────────────────────────────────────────
console.log(`\nSupabase health check — ${SUPABASE_URL}\n`)
let failures = 0
for (const r of results) {
  if (r.warn) {
    console.log(`  ⚠ ${r.label}`)
    console.log(`    → ${r.detail}`)
  } else if (r.ok) {
    console.log(`  ✓ ${r.label}`)
  } else {
    console.log(`  ✗ ${r.label}`)
    console.log(`    → ${r.detail}`)
    failures++
  }
}

if (failures === 0) {
  console.log('\nAll checks passed.\n')
  process.exit(0)
} else {
  console.log(`\n${failures} check${failures > 1 ? 's' : ''} failed. Fix the issues above before deploying.\n`)
  process.exit(1)
}
