// Lesson 11 — Candi Borobudur — bespoke reader page.
//
// A reading-and-history lesson built around one monument. The spine is the
// Indonesian reading passage (the climb up the stupa, gallery by gallery); the
// grammar is the BER- prefix, anchored to Borobudur's own sentence
// ("bertingkat delapan"); the 46-word lexicon names the stones, galleries and
// reliefs; and the page closes on the long Dutch cultural essay about
// Borobudur, Pawon and Mendut — a drop-cap history spread.
//
// Chapters: Inhoud (cover) -> Bacaan -> Grammatica (+ lesson audio) -> Woorden
// -> Cultuur -> Oefenen. Same section components, re-grouped into the chapter
// experience (docs/plans/2026-07-06-lesson-chapter-experience-program.md).
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 11 --pretty > src/pages/lessons/lesson-11/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { AffixTrainerLink } from '@/components/lessons/AffixTrainerLink'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

const meta = content.meta
const sections = content.sections

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

// ─── 1. Indonesian reading passage — the ascent ────────────────────────────

function ReadingPassage({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-bacaan">
      <div className={classes.readingBand}>
        <p className={classes.readingEyebrow}>Bacaan · Leestekst</p>
        <h2 id="s-bacaan" className={classes.sectionTitle}>Candi Borobudur</h2>
        <p className={classes.readingKicker}>
          De tempel ligt zo&apos;n dertig kilometer van Yogyakarta. Wie hem beklimt, begint bij de
          oostelijke poort, loopt naar links, en stijgt langs muren vol <em>ukiran</em> — reliëfs —
          van het gewone mensenleven naar het leven van Boeddha, tot de ronde galerij bovenin.
        </p>
        <div className={classes.readingProse}>
          {c.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </section>
  )
}

// ─── 2. Grammar — the BER- prefix ──────────────────────────────────────────

type GrammarCategory = {
  title: string
  rules?: string[]
  table?: string[][]
  examples?: Array<{ dutch: string; indonesian: string; audioUrl?: string }>
}

const GRAMMAR_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'purple', 'cyan'] as const

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · Het voorvoegsel BER-</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Werkwoorden, focus en de aktievoerder</h2>
      <p className={classes.grammarIntro}>
        Indonesisch onderscheidt basiswerkwoorden van afgeleide. Het voorvoegsel <em>BER-</em> maakt
        van een grondwoord een intransitief werkwoord dat de <em>agens</em> centraal stelt — en het
        zit verstopt in Borobudur&apos;s eigen zin: <em>bertingkat delapan</em>, &ldquo;heeft acht
        niveaus&rdquo;.
      </p>

      <div className={classes.grammarStack}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.grammarBlock} data-accent={GRAMMAR_ACCENTS[i % GRAMMAR_ACCENTS.length]}>
            <header className={classes.grammarHead}>
              <span className={classes.grammarNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.grammarBlockTitle}>{cat.title}</h3>
            </header>

            {cat.rules && cat.rules.length > 0 && (
              <ul className={classes.grammarRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
            )}

            {cat.examples && cat.examples.length > 0 && (
              <div className={classes.grammarExamples}>
                {cat.examples.map((ex, j) => (
                  <div key={j} className={classes.grammarExample}>
                    <div className={classes.grammarExampleIdRow}>
                      <span className={classes.grammarExampleId}>{ex.indonesian}</span>
                      <PlayButton src={ex.audioUrl} />
                    </div>
                    <span className={classes.grammarExampleNl}>{ex.dutch}</span>
                  </div>
                ))}
              </div>
            )}

            {cat.table && cat.table.length > 1 && (
              <div className={classes.gtableWrap}>
                <table className={classes.gtable}>
                  <thead>
                    <tr>{cat.table[0].map((h, j) => <th key={j}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {cat.table.slice(1).map((row, r) => (
                      <tr key={r}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── 3. Vocabulary — the lexicon of the temple ─────────────────────────────

type Item = { dutch: string; indonesian: string; audioUrl?: string }

function Lexicon({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenlijst</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De woorden van de tempel</h2>
      <p className={classes.vocabIntro}>
        De steen, de galerijen, de reliëfs en het ritueel — van <em>candi</em> en <em>stupa</em> tot{' '}
        <em>serambi</em> en <em>ukiran dinding</em>. {c.items.length} woorden, alfabetisch geordend.
      </p>

      <div className={classes.vocabGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.vocabChip}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.vocabId}>{item.indonesian}</span>
            <span className={classes.vocabSep} />
            <span className={classes.vocabNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── 4. Culture — the Borobudur, Pawon and Mendut history spread ───────────

function CultureSpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <div className={classes.cultureBand}>
        <p className={classes.cultureEyebrow}>Cultuur · Sejarah</p>
        <h2 id="s-culture" className={classes.cultureTitle}>Borobudur, Pawon en Mendut</h2>
        <p className={classes.cultureKicker}>
          Gebouwd vanaf 824 onder de boeddhistische vorst Samaratungga: 55.000 kubieke meter andesiet,
          504 Boeddha-beelden, vijf kilometer reliëf. Een gesloten berg waar pelgrims omheen lopen —
          van de aarde naar de hemel, van de laagste terrassen naar de stupa.
        </p>
        <div className={classes.cultureProse}>
          {c.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
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
    /* Hero — Borobudur under stone, gold and a teal dawn. Rendered ABOVE the
       chapter nav via ChapterExperience's hero slot (cover only): the nav sits
       under the hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Candi Borobudur</span>
            <span className={classes.heroTitleNl}>De grootste boeddhistische tempel ter wereld</span>
          </h1>
          <p className={classes.heroDescription}>
            Op Midden-Java, in de vlakte van Kedu, staat een berg van steen die je wel kunt beklimmen
            maar niet kunt binnengaan. Acht niveaus, vijf kilometer reliëf, één gesloten stupa op de
            top. Deze les leest de tempel — en leest, in zijn eigen zin, de grammatica van <em>BER-</em>.
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
            Een tempel beschrijven is taal die opklimt: <em>bertingkat</em>, <em>berbentuk</em>,{' '}
            <em>berangkat</em>. Het Indonesische voorvoegsel BER- maakt van een grondwoord een
            werkwoord dat zegt wat iets is, heeft of doet — en de Borobudur, die acht niveaus telt,
            is er het stille voorbeeld van.
          </p>
          <p className={classes.ledeMeta}>Les 11 · A1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter. NOT wrapped in Shell: the
          overview centers itself on --lesson-col; nesting would double the
          horizontal padding. */}
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
          Activeer de les en de woorden, zinnen en patronen verschijnen automatisch in je oefensessies.
        </p>
        <div className={classes.closingActivation}>
          <ActivationGate activated={activation.activated} saving={activation.saving} onToggle={activation.toggle} />
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
//   0 = text (Dutch culture essay — Borobudur/Pawon/Mendut)
//   1 = text (Indonesian reading passage — the ascent)
//   2 = vocabulary (46-word lexicon)
//   3 = grammar (BER- prefix, 6 categories)
//   4 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story.
    { id: 'inhoud',      title: 'Inhoud',      node: <InhoudChapter /> },
    { id: 'bacaan',      title: 'Bacaan',      description: 'De Indonesische leestekst over de beklimming van de tempel, galerij voor galerij.',
      node: <Shell><ReadingPassage section={sections[1]} /></Shell> },
    { id: 'grammatica',  title: 'Grammatica',  description: 'Het voorvoegsel BER- — van basiswoord naar werkwoord — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar, not orphaned
              on the cover. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            label="Uitleg bij de grammatica · audio"
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
            labelClassName={classes.audioLabel}
          />
          <Shell><GrammarSection section={sections[3]} /></Shell>
          <AffixTrainerLink affixes={['ber-']} />
        </>
      ) },
    { id: 'woorden',     title: 'Woorden',     description: '46 woorden uit de tempel: steen, galerijen, reliëfs en ritueel.',
      node: <Shell><Lexicon section={sections[2]} /></Shell> },
    { id: 'cultuur',     title: 'Cultuur',     description: 'Het verhaal van Borobudur, Pawon en Mendut — bouwwerk en pelgrimsoord.',
      node: <Shell><CultureSpread section={sections[0]} /></Shell> },
    { id: 'oefenen',     title: 'Oefenen',     description: 'Activeer de les en oefen de woorden en de BER-vorm.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson11Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
