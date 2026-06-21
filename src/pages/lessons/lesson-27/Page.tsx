// Lesson 27 — Bab 11 · Sewa Rumah (Een huis huren) — bespoke reader page.
//
// Mood: settling into a tropical home. Ir. Kramer hunts for a furnished house
// in Palembang — the reading is a house tour, then a real rental letter with a
// numbered punch-list of repairs. The vocabulary is the inventory of a furnished
// home (daftar isi rumah); the grammar is the circumfix KE-...-AN, which *wraps*
// a base word — so its six facets are rendered as bracketed "ke-[…]-an" lenses.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 27 --pretty > src/pages/lessons/lesson-27/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
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

// ─── 1. The house tour — the Sewa Rumah reading ──────────────────────────────

function HouseTour({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-read">
      <p className={classes.readEyebrow}>Leestekst · Sewa Rumah</p>
      <h2 id="s-read" className={classes.sectionTitle}>Een ingenieur zoekt een huis in Palembang</h2>
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

// ─── 2. The formal letter — rendered as a sheet of stationery ────────────────

// Paragraph 0 is the letterhead block (addresses + subject), 1 is the salutation,
// 2 holds the prose plus a numbered punch-list of repairs, 3 is the sign-off.
// We split paragraph 2 into its lead sentence + the numbered "yaitu:" list so the
// repair items read as a checklist on the page.

function FormalLetter({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [head, salutation, body, signoff] = c.paragraphs

  // Split the body into its intro sentence and the numbered repair items.
  const lines = body.split('\n')
  const intro = lines.filter((l) => !/^\d+\./.test(l.trim())).join(' ')
  const items = lines
    .filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => l.trim().replace(/^\d+\.\s*/, '').replace(/,$/, ''))

  return (
    <section className={classes.section} aria-labelledby="s-letter">
      <p className={classes.letterEyebrow}>Brief · Surat resmi</p>
      <h2 id="s-letter" className={classes.sectionTitle}>De verhuurder een formele brief schrijven</h2>
      <article className={classes.letterSheet}>
        <pre className={classes.letterHead}>{head}</pre>
        <p className={classes.letterSalutation}>{salutation}</p>
        <p className={classes.letterIntro}>{intro}</p>
        <ol className={classes.letterList}>
          {items.map((it, i) => (
            <li key={i} className={classes.letterItem}>
              <span className={classes.letterNum}>{i + 1}</span>
              <span className={classes.letterItemText}>{it}</span>
            </li>
          ))}
        </ol>
        <p className={classes.letterSignoff}>{signoff}</p>
      </article>
    </section>
  )
}

// ─── 3. Inventory — daftar isi rumah ─────────────────────────────────────────

function Inventory({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · Daftar isi rumah</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De inventaris van een gemeubileerd huis</h2>
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

// ─── 4. Proverb pull-quote ───────────────────────────────────────────────────

function ProverbBand({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [id, nl] = c.paragraphs[0].split('\n')
  return (
    <section className={classes.section}>
      <figure className={classes.proverb}>
        <p className={classes.proverbKicker}>Pepatah</p>
        <p className={classes.proverbId}>{id}</p>
        <figcaption className={classes.proverbNl}>{nl}</figcaption>
      </figure>
    </section>
  )
}

// ─── 5. Grammar — KE-...-AN, one circumfix, six facets ───────────────────────

// The DB ships 6 categories: [0] = overview (functions + base types), [1..5] =
// the individual facets (function A, function B, function C, + reduplication,
// + ME-/TER- contrast). We render [0] as a framing bracket and [1..5] as
// accent-coded "ke-[…]-an" lenses.

const FACET_ACCENTS = ['cyan', 'amber', 'teal', 'purple', 'green', 'cyan'] as const

function GrammarCircumfix({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const overview = c.categories[0]
  const facets = c.categories.slice(1)
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · Eén omhulsel, zes betekenissen</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Het circumfix KE-…-AN</h2>

      {/* Framing overview — the bracket that wraps a base word */}
      <div className={classes.bracketIntro}>
        <span className={classes.bracketGlyph}>
          ke-<span className={classes.bracketSlot}>…</span>-an
        </span>
        <ul className={classes.bracketRules}>
          {overview.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
      </div>

      <div className={classes.facetGrid}>
        {facets.map((facet, i) => (
          <article key={i} className={classes.facetTile} data-accent={FACET_ACCENTS[i % FACET_ACCENTS.length]}>
            <header className={classes.facetHeader}>
              <span className={classes.facetNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.facetTitle}>{facet.title}</h3>
            </header>
            <ul className={classes.facetRules}>
              {facet.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {facet.examples.length > 0 && (
              <div className={classes.facetExamples}>
                {facet.examples.map((ex, j) => (
                  <div key={j} className={classes.facetExample}>
                    <div className={classes.facetExampleId}>
                      {ex.indonesian}
                      <PlayButton src={ex.audioUrl} />
                    </div>
                    <div className={classes.facetExampleNl}>{ex.dutch}</div>
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

export default function Lesson27Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — full-bleed, a Sumatran house and its garden */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Sewa Rumah</span>
              <span className={classes.heroTitleNl}>Een huis huren</span>
            </h1>
            <p className={classes.heroDescription}>
              Insinyur Kramer werkt pas een week in Palembang en woont nog in een hotel. Volgende maand
              komt zijn gezin uit Jakarta over — dus zoekt hij een huis: gemeubileerd, met een grote
              tuin, tegelvloeren en een waaier in elke kamer. Maar eerst moet er nog het een en ander
              worden opgeknapt.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een huis huren is een inventaris doornemen: van <em>tegel</em> tot <em>lemari es</em>, van
            het gordijn tot de kraan die het moet doen. En één omhulsel vat de bijbehorende grammatica
            samen — KE-…-AN, dat een woord omsluit en er een toestand, een gebeurtenis of een teveel
            van maakt.
          </p>
          <p className={classes.ledeMeta}>Les 27 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — guarded band (lights up when audio is attached) */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} voice={meta.primary_voice ?? undefined} />
          </div>
        </section>
      )}

      {/* Main content */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <HouseTour        section={sections[0]} />
          <FormalLetter     section={sections[1]} />
          <ProverbBand      section={sections[3]} />
          <GrammarCircumfix section={sections[4]} />
          <Inventory        section={sections[2]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woordenschat van het huis en de KE-…-AN-patronen verschijnen
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
