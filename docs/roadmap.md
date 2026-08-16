# Product Roadmap

> **Status:** living document — the single forward view of what is next and in what order.
> **Last updated:** 2026-08-11
> **Rewritten 2026-08-11.** The previous version (last touched 2026-06-30) is archived at
> `learning-indonesian-archive/docs/roadmap.md`. It described entitlements, Stripe billing,
> standalone auth and the cloud instance as *future* Phase-2 work; all four shipped between
> 2026-07-12 and 2026-08-06, so it had become actively misleading rather than merely stale.
> The product-ideas master index is folded in here and archived alongside it, at
> `learning-indonesian-archive/docs/plans/2026-07-06-product-ideas-master-index.md`.
> The eight program specs it indexed all remain in `docs/plans/`.

## How to read this

Before this rewrite the answer to "what's on the roadmap?" lived in four places — a stale
`roadmap.md`, the launch runbook, the product-ideas master index, and GitHub issues — and
no single one was complete. Two approved specs were referenced by nothing at all.

**This file now owns direction.** It says what is next, why, and who can do it. It does not
carry operational detail; that stays where it is, indexed at the bottom.

One companion is deliberately NOT folded in: **`docs/process/launch-runbook.md`**. It is an
operational record, not a roadmap — it holds the Stripe dashboard deep links, the
fail-closed traps, the platform gotchas and the *why* behind account-level choices. Its open
items appear below; its knowledge stays there. **Read it before touching Stripe, Cloudflare,
or email.**

Legend: **[owner]** = only Albert can do it · **[agent]** = any Claude session · **[joint]**.

---

## Where the product is (2026-08-11)

**Kamoe Bisa is live at https://kamoebisa.nl and can take real money.** Stripe live account
`acct_1TzEDpFDKKKBKGTH`, €9/month + €79/year tax-inclusive, NL VAT registration active.
Supabase Cloud (`wodpkxsmildtgndnbraa`, eu-west-1, PG 17.6) serves customers; the homelab is
staging and, since the 2026-08-11 cutover, runs the same schema.

Verified green today: `make check-supabase-deep` on **both** cloud and homelab (all
structural checks, HC53 included), and `make check-cloud-config` at **32/32**.

**Zero paying customers.** That is the single most useful fact for planning: access-model and
data-shape changes are still free to make, and that window closes with the first subscriber.

The core pedagogic build is done — vocabulary + collections, the Lezen reader, story
podcasts, the morphology/affix moat, two-axis analytics, pronunciation, grammar exposure.
What remains is **finishing the launch**, then **product depth**, then **content** (never
"done").

---

## NOW — finish the launch

Four blockers. Two need you, two are agent work.

### 1. Real card E2E + refund **[owner]**
The last unexercised money path. Everything to date was proven with Checkout Session creation
and Tax Calculation, never a settled charge. Buy a subscription yourself, confirm the
entitlement row writes and **lesson 2** unlocks (lesson 2, not 4 — free tier is lesson 1),
then refund through the portal to rehearse that path.
⚠ Watch for HTTP 400 *"You cannot collect consent to your terms of service unless a URL is
set"* — that setting fails **closed** and takes the whole product with it. Runbook Phase 1.

### 2. Explain the product **[agent, owner reviews copy]** — runbook Phase 6
⭐ **START HERE: `docs/plans/2026-08-16-landing-page-redesign.md`.** Scoped up on 2026-08-16
from "add an explanation band" to a landing-page rewrite, after the owner's verdict that the
current page *"looks AI generated and a bit clunky, does not really describe the app, how it
works, why we think it works better than Duolingo, and how it compares to a dedicated word
app like Anki."* That file holds seven settled decisions, the proposed spine, and four open
questions — read it before re-deriving any of them.

**The primary persona changed with it** (2026-08-16): from Marijke the heritage learner to
Robin, the person with an Indonesian partner. `personas.md` §1 and `positioning.md` §4 are
both updated; every landing decision traces back to them.

The activation model remains the non-obvious thing, and it fails silently in both directions:
a buyer cannot tell what they would be paying for, and a new learner who activates nothing
opens an empty session and reads it as broken. The capability is already shipped —
`set_lesson_activation` and `set_collection_activation`
(`src/components/collections/Woordenlijsten.tsx`). This is an explanation gap, no schema.

- **Landing page** — the rewrite above. `Landing.copy.ts:41-48` (NL) / `:91-98` (EN) is what
  exists now; `how2Body` gestures at the scheduler, but **nothing says the learner chooses
  what enters it.**
- **In-app** — day one and again day three. `FirstRunChecklist` is the surface. Not a modal,
  not a forced tour. Deliberately sliced second.
- **`/hoe-het-werkt`** — draft exists and is unbuilt:
  `docs/plans/2026-08-06-hoe-het-werkt-page-design.md`. Needs `staff-engineer` → `architect`.
  Its two open questions were answered on 2026-08-16 and the answers are recorded in the
  redesign doc (D6, D7).

### 3. Show locked content — issue #466 **[agent]**
Owner-decided 2026-08-06, deferred out of PR #461. Paid content renders as *absent*, not
locked: `/grammatica` shows **1 of 30** episodes (verified against cloud 2026-08-11 — 30
lessons carry `audio_path`, exactly 1 is free) and `LessonGrammarAudioBand` returns `null`
on paid lessons. A free user cannot tell there is anything to buy.

⚠ **The trap:** derive "locked" from `isEntitled` + `FREE_TIER_MAX_LESSON`, never from a
failed signing call — `null` currently means entitled-no / object-missing / network-blip
alike, so inferring from it shows "locked" to a paying subscriber on a transient failure.

**Build #2 and #3 together.** They are the same problem from two sides; explaining a
scheduler while the shelf renders empty wastes both.

### 4. VAT / OSS + trader identification **[owner + accountant]**
Dutch VAT applies up to €10,000 of EU-wide cross-border B2C digital sales; OSS registration
above it. Stripe's free threshold monitoring watches the line. Separately, `/voorwaarden` §1
and §7 carry only entity + KVK — EU distance-selling rules expect the **btw-id** alongside.
That last part is a copy change and agent-able.

### Newly promoted out of "Deferred": GDPR data-export path **[agent]**
Filed as *"obligation at paid launch — schedule it."* You are at paid launch. Verified
2026-08-11: `supabase/functions/delete-account/` exists, **no export path does**. Erasure is
built, portability is not.

---

## NEXT — product depth

Two unfair advantages drive everything here: the per-learner capability model at word/pattern
granularity, and the NL→ID pair. Verified 2026-08-05: Duolingo offers Dutch speakers ten
courses and Indonesian is not among them, while English speakers get it with 1.21M learners.
Routing through English destroys the loanword advantage, because the loanwords are Dutch. So
the bridge is a *category* advantage, not a feature.

Bets 1 (loanword bridge + placement) and 6 (Spreektaal) have shipped. Order from here:

| # | Item | Why now | Spec |
|---|---|---|---|
| 1 | **I1 Voortgang hero** | The felt-progress unlock; read-model only, no schema | `docs/research/2026-07-06-voortgang-analytics-review.md` |
| 2 | **G1 grammar practice mode** | Spends 2,885 exercises that already exist — exposure, not variety, is the constraint (~1 review/pattern/month) | `docs/research/2026-07-06-grammar-teaching-review.md` |
| 3 | **Bet 2 Weekverhaal** | i+1 stories from the learner's own FSRS state. **Blocked on one decision: the per-learner content regime** | `docs/plans/2026-07-06-weekverhaal-program.md` |
| 4 | **B1 public loanword quiz** | No-account viral quiz; growth-layer leg 0. Needs a funnel endpoint | `docs/plans/2026-07-06-growth-layer-program.md` |
| 5 | **Bet 3 Percakapan** | AI chat constrained to known words; Phase-2 premium SKU | `docs/plans/2026-07-06-percakapan-program.md` |

Also live as programs, unsequenced: **Bet 4 growth layer** (SEO-from-data, heritage
positioning) and **Bet 5 EN audience** (one app, two front doors; NL name is Kamoe Bisa, EN
name still open). Round-2 ideas worth promoting when a slot opens: **A1 Onderweg-modus**
(hands-free audio) and **A3 De stem van je familie** (family voice recordings replace TTS) —
`docs/plans/2026-07-06-experience-and-growth-ideas.md`.

---

## CONTENT — never "done"

Functionality is built; these are authoring tracks.

- **Story podcasts** — slices 2–6 open (#294 authoring quality, #295 Gemini TTS arm, #296
  quality gate + resumable batch, #297 A2 bake-off [HITL], #298 live theme-cluster batch
  [HITL]). Slices 3–5 are *optional pipeline polish*, not blockers.
- **Affix pairs** — more L9–16 + book-2 pairs to fill empty Affix-Trainer tiles.
- **Corpus hygiene** — #363 verify hand-authored lesson 11 against its archived source
  photos; #362 L12/L13 culture-essay overlap.
- **Lesson 6/14 content drift** — open, noted in the Cloudflare hosting memory.

Reader Phase-2 slice 4 (#304, new read-only content) is **closed** — the old roadmap listed
it as remaining.

---

## ENGINEERING — backlog

- **Pagination audit follow-up** `[agent]` — the 1000-row PostgREST cap is mitigated by
  `alter role authenticator set pgrst.db_max_rows`, but shipping 15k–21k rows to the client
  contradicts CLAUDE.md's own *server-side RPC aggregation > crunch client-side* rule.
  `docs/audits/2026-07-30-postgrest-row-cap-audit.md`.
- **Free-tier copy is not machine-pinned** `[agent]` — the boundary is enforced in two places
  and HC55 asserts they agree, but the **prose** advertising it is guarded only by
  `entitlementService.test.ts:42` (a hardcoded `toBe(1)`) and `Landing.test.tsx:90` (matches
  `/gratis/i`). Nine surfaces can drift silently the next time the tier moves.
- **Teardown issues, all HITL-gated** — #98, #102, #151, #153, #212.
- **#471 withhold paid lesson text** — filed deliberately as a *decision*, not a task. The
  read gate is client-side; prose is in the JS bundle and the SW precaches 69 lesson chunks.
- **#409** unordered `.range()` pagination in `check-supabase-deep.ts`.
- **Renovate** — 9 open PRs. Watch `bun.lock` drift: a `package.json` bump without a
  regenerated lockfile breaks every Cloudflare build (`--frozen-lockfile`).
- **Infra hardening** — #238 PWA auto-update, #237 Step-CA 24h leaf cert renewal.

---

## UNCLAIMED — specs nobody can find

Found 2026-08-11 by checking which plans are referenced by no other document. The `approved`
ones are the concerning class: reviewed, safe to build, and invisible.

| Status | Spec | Read |
|---|---|---|
| `approved` | `2026-06-26-grammar-podcast-pipeline-design.md` | Real open work — app side built, pipeline pending NotebookLM login |
| `approved` | `2026-06-24-vocab-annotation-cleanup-and-tts-contamination.md` | Approved, never built, referenced nowhere |
| `draft` | `2026-06-20-morphology-affix-pool-proposer.md` | Unreviewed |
| `draft` | `2026-08-06-onboarding-goals-design.md` | Needs `architect` + `data-architect` — touches `profiles` |

**Frontmatter drift** `[agent]`: `2026-07-09-uitspraak-round2.md` and
`2026-07-10-uitspraak-harmonization-and-podcast.md` are `implementing` but shipped in PR #435.
Umbrella PRDs #300 and #311 are open while their implementation slices shipped — verify and
close.

---

## DEFERRED / NOT DOING

- **Gateway rate limit on `/auth/v1/signup`** — accepted residual (spec §2/§10). Email
  enumeration is inherent to open GoTrue signup with autoconfirm.
- **Re-encoding oversized grammar audio** — bitrate never reliably measured; needs `ffprobe`
  before deciding. Optional since compression put the largest object at 15 MB of the 50 MB cap.
- **Off-site backup leg** and **data-export tooling beyond GDPR** — explicitly deferred.
- **ASR pronunciation grading** — declined in ADR 0025. Phonetic Indonesian means an
  intelligibility grader would false-reject intelligible speech for near-zero gain.
- **Community feedback, AR/VR, leaderboards** — off-strategy; leaderboards were deliberately
  decommissioned.

---

## Standing decisions — do not re-litigate

- **Free tier is lesson 1** (owner, PR #470). Enforced in exactly two places:
  `indonesian.is_free_tier_lesson` (`scripts/migration.sql:4904`) and `FREE_TIER_MAX_LESSON`
  (`src/services/entitlementService.ts:41`). Change both or HC55 fails.
- **Payment is the gate; the invite system is deleted.** Comp access = an admin-inserted
  entitlement row. Do not reintroduce invite codes.
- **Placement seeds FSRS state** via the ADR-0004 carve-out.
- **Bilingual brand:** one app, two names. NL = Kamoe Bisa; EN name open.
- **Public pages get static exports, never anon DB reads** — anon has no read grant on the
  `indonesian` schema, and that schema holds learner tables.
- **No analytics, no third-party cookies** — stated in the privacy policy and pinned by a
  test. Any attribution must be first-party, or the policy changes first.
- **Never invent reviews, ratings, testimonials or learner counts.** There are no customers.
- **Copy honesty:** all audio is TTS; never imply human narration. Cite research principles
  and our own decisions, never efficacy numbers.
- Every item in NEXT needs its own execution spec + review gauntlet before building —
  `staff-engineer` first, then `architect`, plus `data-architect` when data is touched.

---

## Where the detail lives

| Question | File |
|---|---|
| Launch mechanics, Stripe/Cloudflare/email gotchas, the *why* behind account choices | `docs/process/launch-runbook.md` |
| Deploy + the homelab staging cutover | `docs/process/deploy.md` |
| Backup + restore drill | `docs/process/restore-runbook.md` |
| Positioning, personas, pricing, channels, content plan | `docs/marketing/` |
| The five bold bets, in full | `docs/plans/2026-07-06-bold-bets-high-level-specs.md` |
| Competitive landscape | `docs/research/2026-07-06-market-research-competitive-landscape.md` |
| Why the capability system is shaped this way | `docs/adr/` |
| How a module actually works today | `docs/current-system/modules/<name>.md` |
| Content authoring + the 2-stage publish | `docs/process/content-pipeline.md` |

**Maintenance rule:** when the track moves, update this file and
`docs/process/launch-runbook.md` together — the runbook is the source of truth for launch
*sequence*, this file for *direction*. A plan reaching `shipped` should be reflected here in
the same PR.
