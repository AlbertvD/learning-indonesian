// src/pages/publicRoutes.ts — head copy for the public routes, one row each.
//
// Consumed ONLY by scripts/build-public-pages.ts at build time. Nothing imports
// this at runtime, so none of these strings reach a browser chunk — which is why
// it sits outside the `*.copy.ts` convention rather than contradicting it. That
// convention (see Landing.copy.ts's header) is about bundle placement: page copy
// rides in the lazy chunk instead of the entry-resident i18n.ts. Build-time-only
// strings are not governed by it. Precedent for a script importing page copy is
// already established — check-cloud-config.ts imports Landing.copy.ts for the
// same reason.
//
// ⚠️ NO `/` ENTRY, deliberately. The homepage's head lives ONLY in index.html
// (lines 34-51) and the emitter leaves dist/index.html untouched. A `/` row here
// would be a second copy of the homepage head, free to drift from the one that
// actually ships — and patching index.html post-build would also desync the
// service worker's precache revision. See the spec's §3a.
//
// ⚠️ `/login` and `/register` are public routes (App.tsx:138-139) but are
// deliberately absent: they are in neither robots.txt nor sitemap.xml, and a
// sign-in form has no standalone search value. They keep serving the homepage's
// head and being consolidated into `/`, which is the desired outcome.
//
// ── Copy rules (the `marketing` + `marketing-copy` skills, and the claim gate)
//
// These are customer-facing marketing copy, not configuration:
//   - Dutch only. The EN locale was removed 2026-08-18; see Landing.copy.ts.
//   - Every number traces to docs/marketing/facts.md, and where a constant owns
//     the value it is CITED, never retyped — hence LOANWORD_TOTAL below.
//   - NO price and NO free-tier claim in any description. Both are owned
//     elsewhere (PRICING in check-cloud-config.ts; FREE_TIER_MAX_LESSON in
//     entitlementService.ts) and index.html already carries one unpinned copy of
//     each. Adding more is how the €7→€9 change went stale in four places.
//   - No invented social proof, no efficacy figures, no implication of human
//     narration — all audio is TTS.
//
// Spec: docs/plans/2026-08-19-public-page-discoverability.md

import { LOANWORD_TOTAL } from '@/lib/loanwords/revealPairs'

export interface PublicRoute {
  /** Path as served, no trailing slash. Also the emitted directory under dist/. */
  path: string
  /** <title>, og:title, twitter:title. */
  title: string
  /** meta description, og:description, twitter:description. */
  description: string
}

/**
 * The five public routes that need their own head. `/` is excluded on purpose —
 * see the file header.
 *
 * Keep in step with public/sitemap.xml and public/robots.txt. That sync is not
 * automated (a generator was considered and cut as unnecessary mechanism), but
 * it IS asserted: check-cloud-config.ts verifies every sitemap URL serves a
 * document whose head is its own, which fails in both directions — a sitemap URL
 * missing here serves the SPA shell with the homepage's canonical, and a typo
 * here emits a stray file while the real URL still serves the shell.
 */
export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: '/leenwoorden',
    // The page's own H1, which is the strongest headline the product owns: it
    // reframes what the reader believes about themselves before mentioning any
    // product. Uncopyable by any competitor — the loanwords exist only between
    // Dutch and Indonesian, and every large app routes through English.
    title: `${LOANWORD_TOTAL} Nederlandse woorden die je al in het Indonesisch kent — Kamoe Bisa`,
    description:
      'Kantoor → kantor, kamer → kamar, formulier → formulir. Drie eeuwen gedeelde ' +
      `geschiedenis liet honderden Nederlandse woorden achter in het Indonesisch. De hele ` +
      `lijst van ${LOANWORD_TOTAL}, vrij te lezen zonder account.`,
  },
  {
    path: '/hoe-het-werkt',
    // HoeHetWerkt.copy.ts:28 — the page's own title. It states the one thing
    // that confuses new learners (nothing is practised until you switch it on)
    // as a rule the method follows, which reads as method rather than as a quirk.
    title: 'Jij kiest wat je leert, de app kiest wanneer — Kamoe Bisa',
    description:
      'Hoe de cursus werkt: jij zet aan wat je wilt leren, alles komt samen in één ' +
      'sessie per dag, en elk woord schuift door vier fases tot het blijft zitten.',
  },
  {
    path: '/privacy',
    title: 'Privacybeleid — Kamoe Bisa',
    // The no-analytics claim is not marketing garnish: it is what the policy
    // states and it is pinned by a test, so it stays true or the build fails.
    description:
      'Welke gegevens Kamoe Bisa bewaart, waarom, en hoe lang. Geen analytics, ' +
      'geen trackingcookies, geen gegevens naar derden.',
  },
  {
    path: '/voorwaarden',
    title: 'Algemene voorwaarden — Kamoe Bisa',
    description:
      'De voorwaarden voor het gebruik van Kamoe Bisa: het abonnement, opzeggen, ' +
      'en wat je van de cursus mag verwachten.',
  },
  {
    path: '/restitutie',
    title: 'Restitutiebeleid — Kamoe Bisa',
    description:
      'Wanneer je je geld terugkrijgt en hoe je dat aanvraagt, inclusief het ' +
      'herroepingsrecht bij aankoop op afstand.',
  },
]
