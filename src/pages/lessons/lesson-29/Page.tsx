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
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 29 --pretty > src/pages/lessons/lesson-29/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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

// ─── Page composition ────────────────────────────────────────────────────────

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

export default function Lesson29Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — full-bleed, screen-glow over a Bali internet-café photo */}
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
          <ReadingColumn section={sections[0]} />
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
          <Lexicon section={sections[1]} />
          <AcronymDeck section={sections[2]} />
          <Exercises section={sections[5]} />
        </main>
      </section>

      {/* Closing band */}
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
    </article>
  )
}
