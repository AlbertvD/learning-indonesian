// Lesson 17 — Bab 1: Telur Mata Sapi (Spiegelei) — bespoke reader page.
//
// A restaurant/breakfast chapter from "Selamat Datang deel 2". The page reads
// as a short story: Laura wakes craving a European breakfast, walks to a
// restaurant, and a long, warm exchange with waiter Mas Piro unfolds — ending
// on what a "telur mata sapi" actually is. The grammar is a vraagwoorden +
// clitica suite (ME-order, -ku/-mu/-nya, berapa, siapa/apa/mana), so it gets a
// "question machine" treatment: stacked accent blocks, rules first, aligned
// example pairs below.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 17 --pretty > src/pages/lessons/lesson-17/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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

function Vocabulary({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Array<{ dutch: string; indonesian: string; audioUrl?: string }> }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Woorden van het ontbijt</h2>
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

// ─── Page composition ────────────────────────────────────────────────────────

export default function Lesson17Page() {
  const activation = useLessonActivation(meta.id)

  // Grammar is split across three DB sections (6: ME-order + clitics,
  // 7: berapa, 8: siapa/apa/mana + key-word repetition). Number the tiles
  // continuously across all three so the accent rotation reads as one suite.
  const gram6 = (sections[6].content as { categories: GrammarCategory[] }).categories.length
  const gram7 = (sections[7].content as { categories: GrammarCategory[] }).categories.length

  return (
    <article className={classes.page}>
      {/* Hero — golden fried eggs blended under a warm dawn gradient */}
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

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een ontbijtscène waarin de grammatica zélf op tafel ligt: <em>wie</em> doet wat met <em>wat</em>. De ME-vorm zet de zin in de actieve volgorde, de clitica <em>-ku · -mu · -nya</em> plakken het lijdend voorwerp vast, en de vraagwoorden <em>berapa · siapa · apa · mana</em> openen het gesprek.
          </p>
          <p className={classes.ledeMeta}>Selamat Datang deel 2 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — guarded; lights up the moment audio is attached */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} />
          </div>
        </section>
      )}

      {/* Main content — single column */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <ReadingNarrative section={sections[0]} />
          <DialogueScene    section={sections[1]} />
          <Vocabulary       section={sections[3]} />
          <Mealtimes        section={sections[4]} />
          <Proverb          section={sections[5]} />
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
        </main>
      </section>

      {/* Closing band */}
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
    </article>
  )
}
