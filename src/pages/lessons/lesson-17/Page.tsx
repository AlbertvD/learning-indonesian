// Lesson 17 — Bab 1: Telur Mata Sapi (Spiegelei) — bespoke reader page,
// CHAPTER-EXPERIENCE conversion (docs/plans/2026-07-06-lesson-chapter-experience-program.md).
//
// A restaurant/breakfast chapter from "Selamat Datang deel 2". The page reads
// as a short story: Laura wakes craving a European breakfast, walks to a
// restaurant, and a long, warm exchange with waiter Mas Piro unfolds — ending
// on what a "telur mata sapi" actually is. The grammar is a vraagwoorden +
// clitica suite (ME-order, -ku/-mu/-nya, berapa, siapa/apa/mana), so it gets a
// "question machine" treatment: stacked accent blocks, rules first, aligned
// example pairs below.
//
// Chapter conversion: the single scroll splits into 4 content chapters —
// Verhaal, Dialoog, Woorden (vocab + mealtimes + proverb), Grammatica
// (carries the lesson audio) — kept in the same order the single-scroll page
// used them, wrapped via a local Shell (lesson-5 pattern). Section components
// below are unchanged from the pre-chapter Page.tsx (re-grouping, not
// rewriting), EXCEPT Vocabulary, which now also renders content.json section
// 2 — the "how to read the word list" note (basiswoord / ~ notation) that the
// pre-chapter page never rendered at all (a content drop, fixed here; see the
// FIX comment at the Vocabulary component).
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 17 --pretty > src/pages/lessons/lesson-17/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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

// ─── Section: the reading (Laura's morning) ──────────────────────────────────

function ReadingNarrative({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-read">
      <p className={classes.readingEyebrow}>Bacaan · Het verhaal</p>
      <h2 id="s-read" className={classes.sectionTitle}>Een Europees ontbijt</h2>
      <div className={classes.readingProse}>
        {c.paragraphs.map((p, i) => (
          <p key={i} className={classes.readingPara} data-lead={i === 0 ? 'true' : undefined}>{p}</p>
        ))}
      </div>
    </section>
  )
}

// ─── Section: dialogue (restaurant scene) ────────────────────────────────────

function speakerTone(speaker: string): 'laura' | 'mas' {
  return speaker.toLowerCase().includes('laura') ? 'laura' : 'mas'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { setup?: string; lines: Array<{ text: string; speaker: string; translation: string; audioUrl?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Aan tafel</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Ada makanan Eropa, Mas?</h2>
        <p className={classes.dialogueSetup}>
          Laura zoekt een Europees ontbijt. Mas Piro, de ober, somt op wat de keuken te bieden heeft — tot Laura vraagt wat een <em>telur mata sapi</em> nu eigenlijk is.
        </p>

        <div className={classes.dialogueLines}>
          {c.lines.map((line, i) => (
            <div key={i} className={classes.dialogueLine} data-speaker-tone={speakerTone(line.speaker)}>
              <div className={classes.dialogueSpeaker}>{line.speaker}</div>
              <div className={classes.dialogueBody}>
                <div className={classes.dialogueIdRow}>
                  <span className={classes.dialogueId}>{line.text}</span>
                  <PlayButton src={line.audioUrl} />
                </div>
                <div className={classes.dialogueNl}>{line.translation}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section: vocabulary ─────────────────────────────────────────────────────

function Vocabulary({ section, noteSection }: { section: typeof sections[number]; noteSection: typeof sections[number] }) {
  const c = section.content as { items: Array<{ dutch: string; indonesian: string; audioUrl?: string }> }
  const note = noteSection.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Woorden van het ontbijt</h2>
      {/* FIX (2026-07-07, chapter conversion): content.json section 2 — the
          "how to read the word list" note (recognising the basiswoord, the ~
          notation, the shared-glossary convention with Selamat Datang deel 1)
          — was never rendered on the pre-chapter page at all; only the
          hand-written callout below (which covers just the ~ example) stood
          in for it. Render the real paragraphs first; keep the callout since
          it highlights the masak/masakan example visually. */}
      <div className={classes.readingProse}>
        {note.paragraphs.map((p, i) => <p key={i} className={classes.vocabNote}>{p}</p>)}
      </div>
      <p className={classes.vocabNote}>
        Een tilde (<span className={classes.tilde}>~</span>) markeert het basiswoord — <em>masak, ~an</em> = <em>masakan</em>. Sla het basiswoord op; daarop zoek je in het woordenboek.
      </p>
      <div className={classes.vocabGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.vocabChip}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.vocabId}>{item.indonesian}</span>
            <span className={classes.vocabSep}>·</span>
            <span className={classes.vocabNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: mealtimes (expressions) ────────────────────────────────────────

function Mealtimes({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ dutch: string; indonesian: string; audioUrl?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-meal">
      <p className={classes.mealEyebrow}>Uitdrukkingen · De maaltijden</p>
      <h2 id="s-meal" className={classes.sectionTitle}>Ontbijt, lunch en diner</h2>
      <div className={classes.mealRow}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.mealCard}>
            <div className={classes.mealIdRow}>
              <span className={classes.mealId}>{item.indonesian}</span>
              <PlayButton src={item.audioUrl} />
            </div>
            <span className={classes.mealNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: the proverb (a single featured pepatah) ────────────────────────

function Proverb({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ dutch: string; indonesian: string; audioUrl?: string }> }
  const p = c.items[0]
  if (!p) return null
  return (
    <section className={classes.section} aria-labelledby="s-prov">
      <p className={classes.proverbEyebrow}>Pepatah · Een spreuk</p>
      <h2 id="s-prov" className={classes.sectionTitle} hidden>Een spreuk over eieren</h2>
      <figure className={classes.proverbCard}>
        <blockquote className={classes.proverbQuote}>
          <span className={classes.proverbId}>{p.indonesian}</span>
          <PlayButton src={p.audioUrl} />
        </blockquote>
        <figcaption className={classes.proverbNl}>{p.dutch}</figcaption>
      </figure>
    </section>
  )
}

// ─── Section: grammar (question-words + clitics suite) ───────────────────────

type GrammarCategory = {
  title: string
  rules: string[]
  examples: Array<{ dutch: string; indonesian: string; audioUrl?: string }>
}

const GRAMMAR_ACCENTS = ['cyan', 'purple', 'teal'] as const

function GrammarBlocks({
  section,
  eyebrow,
  title,
  startIndex,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  startIndex: number
}) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby={`s-gram-${startIndex}`}>
      <p className={classes.grammarEyebrow}>{eyebrow}</p>
      <h2 id={`s-gram-${startIndex}`} className={classes.sectionTitle}>{title}</h2>

      <div className={classes.grammarStack}>
        {c.categories.map((cat, i) => {
          const n = startIndex + i
          return (
            <article key={i} className={classes.grammarTile} data-accent={GRAMMAR_ACCENTS[n % GRAMMAR_ACCENTS.length]}>
              <header className={classes.grammarTileHeader}>
                <span className={classes.grammarTileNumber}>{`0${n + 1}`}</span>
                <h3 className={classes.grammarTileTitle}>{cat.title}</h3>
              </header>
              <ul className={classes.grammarRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
              {cat.examples.length > 0 && (
                <div className={classes.grammarExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.grammarPair}>
                      <span className={classes.grammarPairId}>
                        {ex.indonesian}
                        <PlayButton src={ex.audioUrl} />
                      </span>
                      <span className={classes.grammarPairArrow} aria-hidden="true">→</span>
                      <span className={classes.grammarPairNl}>{ex.dutch}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps one or more scenes in the shell band the old
// single scroll page shared. Same components, same CSS — re-grouped, not
// rewritten (docs/plans/2026-07-06-lesson-chapter-experience-program.md).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className={classes.shellBand}>
      <main className={classes.shell}>{children}</main>
    </section>
  )
}

function Hero() {
  return (
    /* Hero — golden fried eggs blended under a warm dawn gradient. Rendered
       ABOVE the chapter nav via ChapterExperience's hero slot (cover only). */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Telur Mata Sapi</span>
            <span className={classes.heroTitleNl}>Spiegelei — een ontbijt in een restaurant</span>
          </h1>
          <p className={classes.heroDescription}>
            Drie weken nasi, en deze ochtend wil Laura iets Europees. Ze loopt naar een restaurant en bestelt — maar wat zij precies krijgt, hangt af van één vraag: wat ís een telur mata sapi eigenlijk?
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
            Een ontbijtscène waarin de grammatica zélf op tafel ligt: <em>wie</em> doet wat met <em>wat</em>. De ME-vorm zet de zin in de actieve volgorde, de clitica <em>-ku · -mu · -nya</em> plakken het lijdend voorwerp vast, en de vraagwoorden <em>berapa · siapa · apa · mana</em> openen het gesprek.
          </p>
          <p className={classes.ledeMeta}>Selamat Datang deel 2 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter. NOT wrapped in Shell: the
          overview centers itself on --lesson-col; nesting would double the
          horizontal padding (lesson-5 pattern). */}
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
//   0 = text (Laura's morning — the reading)
//   1 = dialogue (restaurant scene, Laura + Mas Piro)
//   2 = text (word-list reading note: basiswoord, ~ notation — was
//       previously never rendered; now folded into the Woorden chapter)
//   3 = vocabulary (40 items)
//   4 = expressions (mealtimes, 3 items)
//   5 = expressions (a single pepatah)
//   6 = grammar (2 categories — ME-order + the -ku/-mu/-nya clitics)
//   7 = grammar (1 category — berapa?)
//   8 = grammar (4 categories — siapa/apa/mana + key-word repetition)
//   9, 10 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  // Grammar is split across three DB sections (6: ME-order + clitics,
  // 7: berapa, 8: siapa/apa/mana + key-word repetition). Number the tiles
  // continuously across all three so the accent rotation reads as one suite.
  const gram6 = (sections[6].content as { categories: GrammarCategory[] }).categories.length
  const gram7 = (sections[7].content as { categories: GrammarCategory[] }).categories.length

  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (lesson-5 convention).
    { id: 'inhoud',      title: 'Inhoud',      node: <InhoudChapter /> },
    { id: 'verhaal',     title: 'Verhaal',     description: 'Laura\'s ochtend: tegenzin tegenover nasi, en de wandeling naar een Europees restaurant.',
      node: <Shell><ReadingNarrative section={sections[0]} /></Shell> },
    { id: 'dialoog',     title: 'Dialoog',     description: 'Aan tafel bij Mas Piro: het hele menu, en de vraag wat een telur mata sapi eigenlijk is.',
      node: <Shell><DialogueScene section={sections[1]} /></Shell> },
    { id: 'woorden',     title: 'Woorden',     description: 'Veertig woorden van het ontbijt, de drie maaltijden, en een pepatah over eieren.',
      node: (
        <Shell>
          <Vocabulary section={sections[3]} noteSection={sections[2]} />
          <Mealtimes section={sections[4]} />
          <Proverb section={sections[5]} />
        </Shell>
      ) },
    { id: 'grammatica',  title: 'Grammatica',  description: 'De actieve zin met ME-vorm en clitica, berapa, en de vraagwoorden siapa/apa/mana — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar (it's the
              grammar-most chapter — lesson-5/9/14 convention). */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell>
            <GrammarBlocks
              section={sections[6]}
              eyebrow="Grammatica · De actieve zin"
              title="Agens — ME-vorm — patiens, en de clitica -ku / -mu / -nya"
              startIndex={0}
            />
            <GrammarBlocks
              section={sections[7]}
              eyebrow="Grammatica · Vragen om een getal"
              title="Berapa? — wanneer je een aantal verwacht"
              startIndex={gram6}
            />
            <GrammarBlocks
              section={sections[8]}
              eyebrow="Grammatica · De vraagwoorden"
              title="Siapa, apa, mana — en het antwoord zonder 'ja'"
              startIndex={gram6 + gram7}
            />
          </Shell>
        </>
      ) },
    { id: 'oefenen',     title: 'Oefenen',     description: 'Activeer de les en oefen de woorden, zinnen en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson17Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
