// Lesson 23 — Bab 7 · Berdisko di Jakarta — bespoke reader page (chapter-experience conversion).
//
// This is a CULTURE chapter first, a grammar chapter second. The source
// opens with a long reportage essay on Jakarta's nightlife — Ancol and its
// wave pools, the jetset disco at the Sari Pan Pacific, the dangdut stage by
// Monas, and the wry closing observation that the youth dance *in rows*, as
// if afraid to move freely. We lead with that essay as an editorial spread:
// a city-at-night hero, a drop-capped lede, a pull-quote on Saturday night,
// and the outsider's-eye coda lifted into its own callout.
//
// The grammar is the locative/iterative suffix -i — eight categories that
// move from the main rule, through the six word-classes that can take -i,
// to the active/passive paradigm. One category carries a literal table
// (the per-person bedrijvend ↔ lijdend paradigm of menanami / tanami);
// that table is the centrepiece of the grammar band, rendered as a table.
//
// Fifty-two vocabulary items carry the lexis of the essay — the affixed
// pairs (ber-, meN-…-i, ~an) shown with their bare roots, green chips.
//
// Chapters: the cover ("Inhoud" — hero + lede + overview), then one content
// chapter per top-level section (Cultuur / Grammatica / Woorden — the
// lesson only has three, so the grouping is one-section-per-chapter rather
// than an editorial merge), then the closing "Oefenen" chapter. The grammar
// podcast audio moves from the cover into the Grammatica chapter, matching
// lesson 5 and lesson 21 (docs/current-system/modules/chapter-experience.md).
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 23 --pretty > src/pages/lessons/lesson-23/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { AffixTrainerLink } from '@/components/lessons/AffixTrainerLink'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

const meta = content.meta
const sections = content.sections

type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = {
  title: string
  rules: string[]
  examples?: Example[]
  table?: string[][]
}
type Item = { dutch: string; indonesian: string; audioUrl?: string }

// ─── Inline play button ────────────────────────────────────────────────────

function PlayButton({ src }: { src?: string }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  if (!src) return null
  return (
    <>
      <button
        type="button"
        className={classes.playButton}
        data-playing={playing}
        aria-label={playing ? 'Stop' : 'Speel uit'}
        onClick={() => {
          if (!ref.current) return
          if (playing) { ref.current.pause(); ref.current.currentTime = 0; setPlaying(false); return }
          void ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
        }}
      >
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {playing ? <><rect x="2" y="2" width="3" height="8" /><rect x="7" y="2" width="3" height="8" /></> : <polygon points="3,1 11,6 3,11" />}
        </svg>
      </button>
      <audio ref={ref} src={src} preload="none" onEnded={() => setPlaying(false)} />
    </>
  )
}

// ─── Section: Culture spread — Jakarta after dark ──────────────────────────
//
// 9 source paragraphs. We rearrange for reading rhythm:
//   p0  → drop-cap lede (metropool, but little to do)
//   p1  → Ancol (monkeys → modern resort)
//   p2  → the wave pool / Dunia Fantasi / dangdut at Monas
//   pull-quote: Saturday night is for dancing
//   p4  → the jetset disco at the Sari Pan Pacific
//   p5  → the roll-call of other discos
//   p7  → who fills them, and when (malam Minggu)
//   coda callout: p8 — what an outsider finds strange (dancing in rows;
//     fixed from a stale p9 index during the chapter conversion — the
//     content.json paragraphs array has only 9 entries (0-8), so p9 was
//     undefined and this closing punchline never rendered pre-conversion)

function CultureSpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const p = c.paragraphs
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <div className={classes.cultureBand}>
        <p className={classes.cultureKicker}>Cultuur · Jakarta bij nacht</p>
        <h2 id="s-culture" className={classes.cultureDisplay}>
          Een metropool die pas laat tot leven komt,
          <span className={classes.cultureDisplayLine2}>van de golfslagbaden van Ancol tot de jetset-disco aan de Thamrin</span>
        </h2>

        <p className={classes.cultureLede}>{p[0]}</p>

        <p className={classes.cultureBody}>{p[1]}</p>
        <p className={classes.cultureBody}>{p[2]}</p>

        <blockquote className={classes.culturePull}>
          <span className={classes.culturePullMark}>&ldquo;</span>
          Malam Minggu paling cocok untuk pergi berdansa — op zaterdagavond
          trekt iedereen de mooiste kleren aan
          <span className={classes.culturePullMarkClose}>&rdquo;</span>
        </blockquote>

        <p className={classes.cultureBody}>{p[4]}</p>
        <p className={classes.cultureBody}>{p[5]}</p>
        <p className={classes.cultureBody}>{p[7]}</p>

        {/* The outsider's-eye observation — the essay's wry punchline */}
        <div className={classes.coda}>
          <p className={classes.codaKicker}>Untuk orang asing</p>
          <p className={classes.codaBody}>{p[8]}</p>
        </div>
      </div>
    </section>
  )
}

// ─── Section: Grammar — the locative/iterative suffix -i ────────────────────
//
// Eight categories. The first is the overarching rule; the rest drill into
// word-classes, the iterative aspect, the imperative, and the passive
// paradigm. The accent rotates so the stack reads as a sequence of spreads,
// not a card pile. One category carries a `table` (the per-person paradigm)
// and renders it as a centred two-column paradigm table.

const GRAMMAR_ACCENTS = ['cyan', 'purple', 'teal', 'amber'] as const

function GrammarTable({ table }: { table: string[][] }) {
  const [head, ...rows] = table
  return (
    <div className={classes.paradigmWrap}>
      <table className={classes.paradigm}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i === 0 ? classes.paradigmHeadPerson : classes.paradigmHead}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                j === 0
                  ? <th key={j} scope="row" className={classes.paradigmPerson}>{cell}</th>
                  : <td key={j} className={classes.paradigmCell} data-voice={j === 1 ? 'active' : 'passive'}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Het achtervoegsel ·i</p>
      <h2 id="s-gram" className={classes.sectionTitle}>De handeling krijgt een vast doelpunt</h2>

      <div className={classes.grammarRules}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.grammarTile} data-accent={GRAMMAR_ACCENTS[i % GRAMMAR_ACCENTS.length]}>
            <header className={classes.grammarTileHeader}>
              <span className={classes.grammarTileNumber}>{`0${i + 1}`.slice(-2)}</span>
              <h3 className={classes.grammarTileTitle}>{cat.title}</h3>
            </header>
            <div className={classes.grammarTileBody}>
              <ul className={classes.grammarTileRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>

              {cat.table && <GrammarTable table={cat.table} />}

              {cat.examples && cat.examples.length > 0 && (
                <div className={classes.grammarTileExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.grammarExample}>
                      <div className={classes.grammarExampleId}>
                        {ex.indonesian}
                        <PlayButton src={ex.audioUrl} />
                      </div>
                      <div className={classes.grammarExampleNl}>{ex.dutch}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Vocabulary — the lexis of the essay ──────────────────────────

function VocabSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De taal van het nachtleven — {c.items.length} woorden</h2>

      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.itemId}>{item.indonesian}</span>
            <span className={classes.itemSep} />
            <span className={classes.itemNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps ONE scene in the shell band the old single
// scroll page shared. Same components, same CSS — re-grouped, not rewritten
// (docs/plans/2026-07-06-lesson-chapter-experience-program.md).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className={classes.shellBand}>
      <main className={classes.shell}>{children}</main>
    </section>
  )
}

function Hero() {
  return (
    /* Hero — Jakarta skyline at night under a violet→navy gradient. Rendered
       ABOVE the chapter nav via ChapterExperience's hero slot (cover only):
       the nav sits under the hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Berdisko di Jakarta</span>
            <span className={classes.heroTitleNl}>Uitgaan in Jakarta</span>
          </h1>
          <p className={classes.heroDescription}>
            Overdag is Jakarta een metropool met opvallend weinig te doen. Maar
            als het donker wordt, vullen de disco's van Glodok, Blok M en Monas
            zich met jongeren. Een reportage over het nachtleven van de hoofdstad —
            en de grammatica van het achtervoegsel ·i, dat een handeling op een
            vast doelpunt richt.
          </p>
        </div>
      </div>
    </header>
  )
}

function InhoudChapter() {
  return (
    <>
      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een stad leer je het beste kennen <em>na middernacht</em>. Dit hoofdstuk
            leest als een gids: waar je danst, waar de muziek te hard staat, en waarom
            een buitenlander zich verbaast over jongeren die keurig in rijen dansen.
          </p>
          <p className={classes.ledeMeta}>Les 23 · {meta.level} · Berdisko di Jakarta</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview. NOT wrapped in Shell: the
          overview centers itself on --lesson-col; nesting would double the
          horizontal padding (see lesson 5). */}
      <LessonChapterOverview />
    </>
  )
}

function OefenenChapter({ activation }: { activation: ReturnType<typeof useLessonActivation> }) {
  return (
    <section className={classes.closingBand}>
      <div className={classes.closingInner}>
        <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
        <p className={classes.closingLede}>
          Activeer de les en de woorden, de ·i-vormen en het passieve paradigma
          verschijnen automatisch in je oefensessies.
        </p>
        <div className={classes.closingActivation}>
          <ActivationGate activated={activation.activated} saving={activation.saving} onToggle={activation.toggle} loadFailed={activation.loadFailed} onRetryLoad={activation.retryLoad} />
        </div>
        <div className={classes.closingActions}>
          <PracticeActions lessonId={meta.id} activated={activation.activated} />
        </div>
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────
// Section indices in DB order:
//   0 = text (culture spread — Jakarta after dark)
//   1 = vocabulary (52 items)
//   2 = grammar (8 -i categories, incl. the passive paradigm table)
//   3 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (matches lesson 5 / lesson 21).
    { id: 'inhoud',     title: 'Inhoud',     node: <InhoudChapter /> },
    { id: 'cultuur',    title: 'Cultuur',    description: 'Een reportage over het nachtleven van Jakarta — van de golfslagbaden van Ancol tot de jetset-disco aan de Thamrin.',
      node: <Shell><CultureSpread section={sections[0]} /></Shell> },
    { id: 'grammatica', title: 'Grammatica', description: 'Het achtervoegsel -i: acht categorieën, van de hoofdregel tot het passieve paradigma, met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar (matches
              lesson 5 / lesson 21 — it sat orphaned on the cover before). */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarSection section={sections[2]} /></Shell>
          <AffixTrainerLink affixes={['-i', 'meN-…-i', 'di-…-i']} />
        </>
      ) },
    { id: 'woorden',    title: 'Woorden',    description: '52 woorden uit het nachtleven van Jakarta.',
      node: <Shell><VocabSection section={sections[1]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden, de ·i-vormen en het passieve paradigma.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson23Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
