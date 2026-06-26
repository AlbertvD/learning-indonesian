// Lesson 26 — Bab 10 · Musim Hujan (Het regenseizoen) — bespoke reader page.
//
// Mood: a tropical downpour. The reading essay opens like a weather column;
// the grammar is one prefix, TER-, refracted into four distinct senses —
// rendered as a "prism" of four lenses rather than a stack of equal tiles.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 26 --pretty > src/pages/lessons/lesson-26/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

const meta = content.meta
const sections = content.sections

type Item = { dutch: string; indonesian: string; audioUrl?: string }
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

// ─── Reading essay — the rainy-season column ─────────────────────────────────

function RainColumn({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-read">
      <p className={classes.readEyebrow}>Leestekst · Musim Hujan</p>
      <h2 id="s-read" className={classes.sectionTitle}>November tot maart, als de hemel openbarst</h2>
      <div className={classes.readBand}>
        {c.paragraphs.map((para, i) =>
          para.split('\n').map((line, j) => (
            <p key={`${i}-${j}`} className={classes.readPara} data-lead={i === 0 && j === 0 ? 'true' : undefined}>
              {line}
            </p>
          )),
        )}
      </div>
    </section>
  )
}

// ─── Proverb pull-quote ──────────────────────────────────────────────────────

function ProverbBand({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [id, nl] = c.paragraphs[0].split(' — ')
  return (
    <section className={classes.section}>
      <figure className={classes.proverb}>
        <p className={classes.proverbId}>{id}</p>
        <figcaption className={classes.proverbNl}>{nl}</figcaption>
      </figure>
    </section>
  )
}

// ─── Vocabulary / weather lexicon ────────────────────────────────────────────

function Lexicon({
  section, eyebrow, title, tone, id,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  tone: 'rain' | 'sky'
  id: string
}) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={tone === 'rain' ? classes.vocabEyebrow : classes.skyEyebrow}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>
      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip} data-tone={tone}>
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

// ─── Expressions — idioms + season names ─────────────────────────────────────

function Expressions({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.exprEyebrow}>Uitdrukkingen · Wind en seizoenen</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Vaste verbindingen rond het weer</h2>
      <div className={classes.exprGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.exprChip}>
            <div className={classes.exprIdRow}>
              <PlayButton src={item.audioUrl} />
              <span className={classes.exprId}>{item.indonesian}</span>
            </div>
            <span className={classes.exprNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Grammar — TER-, one form refracted into four senses ─────────────────────

// The DB ships 5 categories: [0] = overview (two positions), [1..4] = the four
// senses. We render [0] as a framing intro and [1..4] as a numbered prism.

const SENSE_ACCENTS = ['amber', 'cyan', 'teal', 'purple'] as const

function GrammarPrism({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const overview = c.categories[0]
  const senses = c.categories.slice(1)
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · Eén vorm, vier betekenissen</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Het voorvoegsel TER-</h2>

      {/* Framing overview — the "prism" through which one form splits */}
      <div className={classes.prismIntro}>
        <span className={classes.prismGlyph}>ter-</span>
        <ul className={classes.prismRules}>
          {overview.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
      </div>

      <div className={classes.senseGrid}>
        {senses.map((sense, i) => (
          <article key={i} className={classes.senseTile} data-accent={SENSE_ACCENTS[i % SENSE_ACCENTS.length]}>
            <header className={classes.senseHeader}>
              <span className={classes.senseNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.senseTitle}>{sense.title}</h3>
            </header>
            <ul className={classes.senseRules}>
              {sense.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {sense.examples.length > 0 && (
              <div className={classes.senseExamples}>
                {sense.examples.map((ex, j) => (
                  <div key={j} className={classes.senseExample}>
                    <div className={classes.senseExampleId}>
                      {ex.indonesian}
                      <PlayButton src={ex.audioUrl} />
                    </div>
                    <div className={classes.senseExampleNl}>{ex.dutch}</div>
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

// ─── Page composition ────────────────────────────────────────────────────────

export default function Lesson26Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — full-bleed, monsoon-toned */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Musim Hujan</span>
              <span className={classes.heroTitleNl}>Het regenseizoen</span>
            </h1>
            <p className={classes.heroDescription}>
              Van november tot maart komt de regen niet als motregen maar als een muur van water.
              Afspraken worden afgezegd, de telefoonlijn valt uit — en toch zit er iets goeds in.
              Een hoofdstuk over weer, klimaat, en het voorvoegsel dat een toestand vastlegt: TER-.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            In Indonesië val je niet zomaar in slaap — je wordt overvallen door de slaap. Je laat een
            deur niet open — de deur <em>staat</em> open. Eén voorvoegsel, TER-, vangt dat onbedoelde,
            dat al-gebeurd-zijn. Vier betekenissen, één vorm.
          </p>
          <p className={classes.ledeMeta}>Les 26 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — guarded band (lights up when audio is attached) */}
      <LessonGrammarAudioBand
        nl={meta.lesson_audio_url}
        en={meta.lesson_audio_url_en}
        voice={meta.primary_voice ?? undefined}
        bandClassName={classes.audioBand}
        innerClassName={classes.audioInner}
      />

      {/* Main content */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <RainColumn   section={sections[0]} />
          <ProverbBand  section={sections[3]} />
          <GrammarPrism section={sections[6]} />
          <Lexicon
            section={sections[1]}
            eyebrow="Woordenschat · Alam dan iklim"
            title="Natuur, weer en wat de regen meebrengt"
            tone="rain"
            id="s-vocab"
          />
          <Lexicon
            section={sections[5]}
            eyebrow="Seizoenen & verschijnselen"
            title="Van salju tot gempa bumi"
            tone="sky"
            id="s-sky"
          />
          <Expressions  section={sections[2]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woorden, uitdrukkingen en TER-patronen verschijnen automatisch in je
            oefensessies.
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
