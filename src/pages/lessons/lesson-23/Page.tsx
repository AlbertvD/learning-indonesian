// Lesson 23 — Bab 7 · Berdisko di Jakarta — bespoke reader page.
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
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 23 --pretty > src/pages/lessons/lesson-23/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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
// 10 source paragraphs. We rearrange for reading rhythm:
//   p0  → drop-cap lede (metropool, but little to do)
//   p1  → Ancol (monkeys → modern resort)
//   p2  → the wave pool / Dunia Fantasi / dangdut at Monas
//   pull-quote: Saturday night is for dancing
//   p4  → the jetset disco at the Sari Pan Pacific
//   p5  → the roll-call of other discos
//   p7  → who fills them, and when (malam Minggu)
//   coda callout: p9 — what an outsider finds strange (dancing in rows)

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
          <p className={classes.codaBody}>{p[9]}</p>
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

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson23Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — Jakarta skyline at night under a violet→navy gradient */}
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

      {/* Editorial lede — the page's voice */}
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

      {/* Lesson audio — guarded; lights up when audio_path is set */}
      <LessonGrammarAudioBand
        nl={meta.lesson_audio_url}
        en={meta.lesson_audio_url_en}
        voice={meta.primary_voice ?? undefined}
        bandClassName={classes.audioBand}
        innerClassName={classes.audioInner}
      />

      {/* Main content — single column, aligned to lede width */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <CultureSpread section={sections[0]} />
          <GrammarSection section={sections[2]} />
          <VocabSection section={sections[1]} />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woorden, de ·i-vormen en het passieve paradigma
            verschijnen automatisch in je oefensessies.
          </p>
          <div className={classes.closingActivation}>
            <ActivationGate activated={activation.activated} saving={activation.saving} onToggle={activation.toggle} />
          </div>
          <div className={classes.closingActions}>
            <PracticeActions lessonId={meta.id} activated={activation.activated} />
          </div>
        </div>
      </section>
    </article>
  )
}
