// Lesson 29 — Bab 13 · Internet di Indonesia (Het internet in Indonesië) — bespoke reader page.
//
// Mood: a dispatch from 1995. The reading essay reads like an early-web column —
// W-Net, modems, "realitas virtual" — rendered inside a screen-glow terminal band.
// Two grammar spreads stand side by side as the lesson's spine: the active
// MEMPER-/DIPER- engine (six lenses) and the nominalising PER-...-AN confix
// (four lenses). Cyan/teal carries the connectivity; purple carries the
// nominalisation. Plus an acronym deck (iptek · PT · wartel) — the lexicon of
// a wired Indonesia.
//
// Chapters: the cover ("Inhoud" — hero + lede + overview), then Leestekst (the
// reading essay), Grammatica (both grammar spreads together, with the lesson
// audio), Woorden (the main lexicon + the small acronym deck merged — three
// items don't earn their own chapter, matching lesson 12's Woorden merge),
// Latihan (the textbook exercises as a study reference), then the closing
// "Oefenen" chapter.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 29 --pretty > src/pages/lessons/lesson-29/content.json

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

type Item = { dutch: string; indonesian: string; english?: string; audioUrl?: string }
type GrammarExample = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: GrammarExample[] }

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

// ─── Reading essay — the 1995 dispatch ───────────────────────────────────────

function ReadingColumn({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-read">
      <p className={classes.readEyebrow}>Leestekst · Agustus 1995</p>
      <h2 id="s-read" className={classes.sectionTitle}>Toen Indonesië online ging</h2>
      <div className={classes.readBand}>
        <div className={classes.readChrome} aria-hidden="true">
          <span className={classes.readDot} data-c="r" />
          <span className={classes.readDot} data-c="y" />
          <span className={classes.readDot} data-c="g" />
          <span className={classes.readChromeLabel}>wasantara-net · w-net</span>
        </div>
        <div className={classes.readBody}>
          {c.paragraphs.map((para, i) => (
            <p key={i} className={classes.readPara} data-lead={i === 0 ? 'true' : undefined}>
              {para}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Vocabulary — the wired lexicon ──────────────────────────────────────────

function Lexicon({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · Internet en telecom</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Het vocabulaire van een verbonden land</h2>
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

// ─── Acronyms & abbreviations — the deck ─────────────────────────────────────

function AcronymDeck({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-acro">
      <p className={classes.acroEyebrow}>Akronim dan singkatan</p>
      <h2 id="s-acro" className={classes.sectionTitle}>Letterwoorden uit de tekst</h2>
      <div className={classes.acroGrid}>
        {c.items.map((item, i) => (
          <article key={i} className={classes.acroCard}>
            <div className={classes.acroHead}>
              <span className={classes.acroGlyph}>{item.indonesian}</span>
              <PlayButton src={item.audioUrl} />
            </div>
            <span className={classes.acroNl}>{item.dutch}</span>
            {item.english && <span className={classes.acroEn}>{item.english}</span>}
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Grammar — accent-coded lens tiles, aligned example pairs ────────────────

function GrammarSpread({
  section, eyebrow, title, glyph, accents, id,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  glyph: string
  accents: readonly string[]
  id: string
}) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={classes.grammarEyebrow}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>
      <div className={classes.grammarLede} aria-hidden="true">
        <span className={classes.grammarGlyph}>{glyph}</span>
      </div>
      <div className={classes.lensGrid}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.lensTile} data-accent={accents[i % accents.length]}>
            <header className={classes.lensHeader}>
              <span className={classes.lensNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.lensTitle}>{cat.title}</h3>
            </header>
            <ul className={classes.lensRules}>
              {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {cat.examples.length > 0 && (
              <div className={classes.lensExamples}>
                {cat.examples.map((ex, j) => (
                  <div key={j} className={classes.lensExample}>
                    <div className={classes.lensExampleId}>
                      <span>{ex.indonesian}</span>
                      <PlayButton src={ex.audioUrl} />
                    </div>
                    <div className={classes.lensExampleNl}>{ex.dutch}</div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

const MEMPER_ACCENTS = ['cyan', 'teal', 'cyan', 'teal', 'cyan', 'teal'] as const
const PERAN_ACCENTS = ['purple', 'teal', 'purple', 'teal'] as const

// ─── Exercises — the Latihan, as a study reference ───────────────────────────

function Exercises({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    sections: { title: string; instruction: string; items: { prompt: string; answer?: string }[] }[]
  }
  return (
    <section className={classes.section} aria-labelledby="s-exercises">
      <p className={classes.grammarEyebrow}>Oefeningen · Latihan</p>
      <h2 id="s-exercises" className={classes.sectionTitle}>Oefeningen</h2>
      <div className={classes.exerciseList}>
        {c.sections.map((blk, i) => (
          <article key={i} className={classes.exerciseBlock}>
            <h3 className={classes.exerciseBlockTitle}>{blk.title}</h3>
            <p className={classes.exerciseInstruction}>{blk.instruction}</p>
            {blk.items.length > 0 && (
              <ol className={classes.exerciseItems}>
                {blk.items.map((it, j) => (
                  <li key={j} className={classes.exerciseItem}>
                    <span className={classes.exercisePrompt}>{it.prompt}</span>
                    {it.answer && <span className={classes.exerciseAnswer}>{it.answer}</span>}
                  </li>
                ))}
              </ol>
            )}
          </article>
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
    /* Hero — screen-glow gradient over a Bali internet-café photo. Rendered
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
            <span className={classes.heroTitleId}>Internet di Indonesia</span>
            <span className={classes.heroTitleNl}>Het internet in Indonesië</span>
          </h1>
          <p className={classes.heroDescription}>
            Augustus 1995. Pos Indonesia kondigt W-Net aan, en in vier grote steden — Jakarta,
            Bandung, Surabaya, Semarang — gaat het netwerk live. Een computer, een modem, een
            telefoonlijn, een wachtwoord: en je stapt de "realitas virtual" binnen. Een hoofdstuk
            over een land dat online gaat — en over twee afleidingen die het mogelijk maken:
            MEMPER- en PER-…-AN.
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
            Je verstuurt een brief <em>tanpa sehelai kertas pun</em> — zonder ook maar één vel papier.
            Je praat met een Rus, een Turk, een Amerikaan, tegen lokaal tarief, 24 uur per dag. De
            taal volgt: bij <em>memperbesar</em> wordt iets groots nóg groter, bij <em>perusahaan</em>
            wordt een handeling een bedrijf.
          </p>
          <p className={classes.ledeMeta}>Les 29 · {meta.level} · Bahasa Indonesia</p>
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
          Activeer de les en de woorden, akroniemen en MEMPER- / PER-…-AN-patronen verschijnen
          automatisch in je oefensessies.
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
//   0 = text (the 1995 internet dispatch)
//   1 = vocabulary (59 items — the wired lexicon)
//   2 = vocabulary (3 items — the acronym deck: iptek, PT, wartel)
//   3 = grammar (6 MEMPER-/DIPER- categories)
//   4 = grammar (4 PER-...-AN categories)
//   5 = exercises (Latihan I/II/III — rendered as a study reference)
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
    { id: 'leestekst',  title: 'Leestekst',  description: 'Augustus 1995: Pos Indonesia lanceert Wasantara-Net — een dispatch uit het vroege internettijdperk.',
      node: <Shell><ReadingColumn section={sections[0]} /></Shell> },
    { id: 'grammatica', title: 'Grammatica', description: 'MEMPER-/DIPER- en PER-…-AN: de intensieve causatief en het nominaliserende omhulsel — met de les-audio.',
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
          <Shell>
            <GrammarSpread
              section={sections[3]}
              eyebrow="Grammatica · De actieve motor"
              title="MEMPER- / DIPER-: de intensieve causatief"
              glyph="memper-"
              accents={MEMPER_ACCENTS}
              id="s-memper"
            />
            <GrammarSpread
              section={sections[4]}
              eyebrow="Grammatica · Het nominaliserende omhulsel"
              title="PER-…-AN: van handeling naar instelling"
              glyph="per-…-an"
              accents={PERAN_ACCENTS}
              id="s-peran"
            />
          </Shell>
          <AffixTrainerLink affixes={['memper-', 'per-…-an', 'memper-…-kan']} />
        </>
      ) },
    { id: 'woorden',    title: 'Woorden',    description: '59 woorden uit een verbonden land, plus drie letterwoorden: iptek, PT en wartel.',
      node: (
        <Shell>
          <Lexicon section={sections[1]} />
          <AcronymDeck section={sections[2]} />
        </Shell>
      ) },
    { id: 'latihan',    title: 'Latihan',    description: 'Drie oefeningen op de PER-vormen, klaar om te maken.',
      node: <Shell><Exercises section={sections[5]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden, akroniemen en MEMPER- / PER-…-AN-patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson29Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
