// Lesson 10 — Ke Kantor Pos (Naar het postkantoor) — bespoke reader page.
//
// A wayfinding lesson: Narti asks Pak the way to the post office and gets a
// turn-by-turn route. The page is built around the journey — the dialogue is
// the spine, the vocabulary is the lexicon of the road, the grammar is
// rendered from its reference tables, and the lesson closes on the Majapahit
// history spread that the dialogue's final line ("Jalan Gajah Mada") opens onto.
//
// Chapter conversion (docs/plans/2026-07-06-lesson-chapter-experience-program.md):
// grouping is editorial, not mechanical — the four separate grammar topics
// (-AN suffix, ordinals, arithmetic, conjunctions) are kept in ONE
// "Grammatica" chapter (mirrors lesson 5's single grammar chapter), while the
// rasa/kira/pikir nuance panel gets its own small chapter rather than being
// folded into grammar, since it's a lexical-nuance topic, not a grammar rule.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 10 --pretty > src/pages/lessons/lesson-10/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
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

// ─── 1. Dialogue rendered as a route ───────────────────────────────────────

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

function speakerTone(speaker: string): 'narti' | 'pak' {
  return speaker.toLowerCase().includes('narti') ? 'narti' : 'pak'
}

function RouteScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-route">
      <div className={classes.routeBand}>
        <p className={classes.routeEyebrow}>Dialoog · De weg vragen</p>
        <h2 id="s-route" className={classes.sectionTitle}>Ke Kantor Pos</h2>
        <p className={classes.routeSetup}>
          Narti wil postzegels kopen om een brief naar haar familie in Caïro te sturen — maar ze weet
          de weg niet. Een oudere man wijst haar de route: eerst met de becak, dan te voet, linksaf bij
          de eerste straat, over de brug, en oversteken bij de voetgangersbrug.
        </p>

        <div className={classes.dialogueLines}>
          {c.lines.map((line, i) => {
            const isRoute = line.text.length > 120
            return (
              <div
                key={i}
                className={classes.dialogueLine}
                data-speaker-tone={speakerTone(line.speaker)}
                data-key-step={isRoute || undefined}
              >
                <div className={classes.dialogueSpeaker}>{line.speaker}</div>
                <div className={classes.dialogueBody}>
                  <div className={classes.dialogueIdRow}>
                    <span className={classes.dialogueId}>{line.text}</span>
                    <PlayButton src={line.audioUrl} />
                  </div>
                  <div className={classes.dialogueNl}>{line.translation}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── 2. Vocabulary — lexicon of the road ───────────────────────────────────

type Item = { dutch: string; indonesian: string; audioUrl?: string }

function Lexicon({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De woorden van de route</h2>
      <p className={classes.vocabIntro}>
        Alles wat je onderweg tegenkomt — van <em>becak</em> en <em>jembatan</em> tot{' '}
        <em>prangko</em> en <em>paket</em>. {c.items.length} woorden, alfabetisch geordend.
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

// ─── 3. Expression — the parting formula ───────────────────────────────────

function PartingFormula({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  const item = c.items[0]
  if (!item) return null
  return (
    <section className={classes.section} aria-labelledby="s-parting">
      <p className={classes.partingEyebrow}>Uitdrukking · Afscheid nemen</p>
      <h2 id="s-parting" className={classes.sectionTitle}>De afscheidsformule</h2>

      <div className={classes.partingCard}>
        <div className={classes.partingExchange}>
          <span className={classes.partingId}>{item.indonesian}</span>
          <PlayButton src={item.audioUrl} />
        </div>
        <p className={classes.partingNote}>{item.dutch}</p>
      </div>
    </section>
  )
}

// ─── 4. Grammar — prose rules + reference tables ───────────────────────────

type GrammarCategory = {
  title: string
  rules?: string[]
  table?: string[][]
  examples?: Array<{ dutch: string; indonesian: string }>
}

function GrammarSection({
  section,
  eyebrow,
  title,
  accent,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  accent: 'purple' | 'cyan' | 'teal' | 'amber'
}) {
  const c = section.content as { categories: GrammarCategory[] }
  const id = `s-gram-${title.replace(/\W+/g, '')}`
  return (
    <section className={classes.section} data-accent={accent} aria-labelledby={id}>
      <p className={classes.grammarEyebrow}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>

      <div className={classes.grammarStack}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.grammarBlock}>
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
                    <span className={classes.grammarExampleId}>{ex.indonesian}</span>
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

// ─── 5. Nuance panel — rasa / kira / pikir ─────────────────────────────────

function NuancePanel({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const intro = c.paragraphs[0]
  // paragraphs[1] = the three glosses, paragraphs[2] = the three example sentences,
  // both as newline-separated "indonesian<spaces>dutch" rows.
  const splitRow = (line: string) => {
    const m = line.match(/^(\S+)\s{2,}(.+)$/)
    return m ? { id: m[1], gloss: m[2].trim() } : { id: line, gloss: '' }
  }
  const words = (c.paragraphs[1] ?? '').split('\n').filter(Boolean).map(splitRow)
  const examples = (c.paragraphs[2] ?? '').split('\n').filter(Boolean).map(splitRow)

  return (
    <section className={classes.section} aria-labelledby="s-nuance">
      <p className={classes.nuanceEyebrow}>Taalgevoel · Hart en hoofd</p>
      <h2 id="s-nuance" className={classes.sectionTitle}>Voelen, vinden, denken</h2>
      <p className={classes.nuanceIntro}>{intro}</p>

      <div className={classes.nuanceTriple}>
        {words.map((w, i) => (
          <div key={i} className={classes.nuanceWord}>
            <div className={classes.nuanceWordId}>{w.id}</div>
            <div className={classes.nuanceWordGloss}>{w.gloss}</div>
          </div>
        ))}
      </div>

      <div className={classes.nuanceExamples}>
        {examples.map((ex, i) => (
          <div key={i} className={classes.nuanceExampleRow}>
            <span className={classes.nuanceExampleId}>{ex.id}</span>
            <span className={classes.nuanceExampleNl}>{ex.gloss}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── 6. Majapahit — history spread ─────────────────────────────────────────

function HistorySpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [headline, ...body] = c.paragraphs
  return (
    <section className={classes.section} aria-labelledby="s-history">
      <div className={classes.historyBand}>
        <p className={classes.historyEyebrow}>Cultuur · Sejarah</p>
        <h2 id="s-history" className={classes.historyTitle}>{headline}</h2>
        <p className={classes.historyKicker}>
          De man wees Narti naar de <em>Jalan Gajah Mada</em>. Achter die straatnaam schuilt de
          machtigste rijksbestuurder die Java ooit kende — en de gelofte waarmee hij een archipel onderwierp.
        </p>
        <div className={classes.historyProse}>
          {body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps the same scenes the old single scroll page
// shared, inside the shell band. Same components, same CSS — re-grouped, not
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
    /* Hero — full-bleed Yogyakarta street. Rendered ABOVE the chapter nav via
       ChapterExperience's hero slot (cover only): the nav sits under the hero
       and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Ke Kantor Pos</span>
            <span className={classes.heroTitleNl}>Naar het postkantoor</span>
          </h1>
          <p className={classes.heroDescription}>
            Narti is de weg kwijt. Ze wil postzegels kopen, maar het postkantoor ligt ver — eerst met
            de becak, dan te voet, over de brug. Een les over de weg vragen, de woorden van de straat,
            en de geschiedenis die in één straatnaam meereist.
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
            Een route uitleggen is taal in beweging: <em>belok kiri</em>, <em>terus</em>,{' '}
            <em>menyeberang</em>. Wie de weg vraagt, leert vanzelf richtingen, plaatsen en het ritme van
            een Indonesische stad — en eindigt, zoals Narti, bij een straat die naar een keizerrijk is vernoemd.
          </p>
          {/* meta.level, not a hardcoded string — the old copy said A1 while
              the lesson is A2 (flagged during the chapter conversion). */}
          <p className={classes.ledeMeta}>Les 10 · {meta.level} · Bahasa Indonesia</p>
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
//   0 = text (Majapahit / Gajah Mada history)
//   1 = dialogue (Narti asks Pak the way)
//   2 = vocabulary
//   3 = expressions (parting formula)
//   4 = grammar (-AN suffix)
//   5 = text (rasa / kira / pikir nuance)
//   6 = grammar (rangtelwoorden)
//   7 = grammar (rekenen)
//   8 = grammar (voegwoorden)
//   9 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story.
    { id: 'inhoud',       title: 'Inhoud',       node: <InhoudChapter /> },
    { id: 'weg-vragen',   title: 'De weg vragen', description: 'Narti vraagt de weg naar het postkantoor — en hoe je afscheid neemt.',
      node: (
        <Shell>
          <RouteScene section={sections[1]} />
          <PartingFormula section={sections[3]} />
        </Shell>
      ) },
    { id: 'grammatica',   title: 'Grammatica',   description: 'Het achtervoegsel -AN, rangtelwoorden, rekenen en voegwoorden — met de les-audio.',
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
          <Shell>
            <GrammarSection
              section={sections[4]}
              eyebrow="Grammatica · Achtervoegsel -AN"
              title="Van grondwoord naar naamwoord"
              accent="purple"
            />
            <GrammarSection
              section={sections[6]}
              eyebrow="Grammatica · Rangtelwoorden"
              title="Eerste, tweede, derde — met KE-"
              accent="cyan"
            />
            <GrammarSection
              section={sections[7]}
              eyebrow="Grammatica · Rekenen"
              title="Optellen, aftrekken, delen"
              accent="teal"
            />
            <GrammarSection
              section={sections[8]}
              eyebrow="Grammatica · Voegwoorden"
              title="Omdat, opdat, mits, ofschoon"
              accent="amber"
            />
          </Shell>
        </>
      ) },
    { id: 'taalgevoel',   title: 'Taalgevoel',   description: 'Rasa, kira en pikir: drie woorden voor voelen en denken.',
      node: <Shell><NuancePanel section={sections[5]} /></Shell> },
    { id: 'woorden',      title: 'Woorden',      description: 'Woorden uit de wereld van de weg en het postkantoor.',
      node: <Shell><Lexicon section={sections[2]} /></Shell> },
    { id: 'geschiedenis', title: 'Geschiedenis', description: 'Majapahit en Gajah Mada — het rijk achter de straatnaam Jalan Gajah Mada.',
      node: <Shell><HistorySpread section={sections[0]} /></Shell> },
    { id: 'oefenen',      title: 'Oefenen',      description: 'Activeer de les en oefen de woorden en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson10Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
