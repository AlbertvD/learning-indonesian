// Lesson 19 — Bab 3: Zinsbouw (Sentence structure) — bespoke reader page.
//
// A syntax-only chapter: no vocabulary, no dialogue. Two grammatical movements
// drive the page. First, the architecture of an Indonesian sentence — agens,
// handeling, patiens, and the optional partijen 3 and 4 with their marker
// words — rendered as a horizontal SLOT DIAGRAM, then the full word-order recipe
// as an ordered track. Second, the connectives: reason/cause (sebab, karena)
// and purpose/consequence (supaya tegenover sehingga), each an accent-coded tile
// with aligned Indonesisch → Nederlands example pairs. The recurring textbook
// scene — the president opening a school in Denpasar — gives the hero its place.
//
// The exercises section is the practice surface's content (the session engine
// renders the prompts); the reader only gets an editorial teaser of the four
// latihan, never the prompts themselves.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 19 --pretty > src/pages/lessons/lesson-19/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples?: Example[] }

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

// ─── Example pair: Indonesisch → Nederlands, aligned ───────────────────────
// The Indonesian sits on the left as the primary line; the Dutch reading sits
// beneath, de-emphasised. Used inside the connective tiles.

function ExampleRow({ ex }: { ex: Example }) {
  return (
    <div className={classes.example}>
      <div className={classes.exampleId}>
        <span className={classes.exampleIdText}>{ex.indonesian}</span>
        <PlayButton src={ex.audioUrl} />
      </div>
      <div className={classes.exampleNl}>{ex.dutch}</div>
    </div>
  )
}

// ─── Movement 1: The sentence architecture ─────────────────────────────────
// cat[0] = participants (agens/patiens/partij 3/partij 4 + marker words)
// cat[1] = the usual word order in an active sentence

// The four participant slots, distilled from cat[0]'s rules into a diagram.
const SLOTS = [
  { tag: '1', role: 'agens', gloss: 'wie de handeling uitvoert', accent: 'cyan' },
  { tag: 'V', role: 'handeling', gloss: 'de werkwoordsvorm', accent: 'amber' },
  { tag: '2', role: 'patiens', gloss: 'wie de handeling ondergaat', accent: 'purple' },
] as const

// The optional participants and their marker words.
const PARTIJEN = [
  { tag: '3', role: 'voor wie / waarvoor', markers: ['bagi', 'buat', 'kepada', 'untuk'], accent: 'teal' },
  { tag: '4', role: 'met wie / waarmee', markers: ['dengan', 'sama', 'tanpa'], accent: 'green' },
] as const

// The full word-order track, with the marker word that introduces each slot.
const ORDER = [
  { label: 'tijd', marker: 'waktu, pada …' },
  { label: 'partij 1', marker: 'agens' },
  { label: 'wijze', marker: 'secara …' },
  { label: 'handeling', marker: 'werkwoord' },
  { label: 'partij 2', marker: 'patiens' },
  { label: 'partij 3', marker: 'bagi, buat …' },
  { label: 'partij 4', marker: 'dengan, sama …' },
  { label: 'plaats', marker: 'dari, di, ke' },
] as const

function ArchitectureSection({ cats }: { cats: GrammarCategory[] }) {
  const participants = cats[0]
  const wordOrder = cats[1]
  return (
    <section className={classes.section} aria-labelledby="s-arch">
      <p className={classes.archEyebrow}>Zinsarchitectuur</p>
      <h2 id="s-arch" className={classes.sectionTitle}>Wie doet wat, voor wie, waarmee</h2>

      {/* The participant slot diagram — the visual heart of the lesson. */}
      <div className={classes.schema}>
        <div className={classes.schemaCore}>
          {SLOTS.map((s, i) => (
            <div key={s.tag} className={classes.schemaSlotWrap}>
              <div className={classes.schemaSlot} data-accent={s.accent}>
                <span className={classes.slotTag}>partij {s.tag}</span>
                <span className={classes.slotRole}>{s.role}</span>
                <span className={classes.slotGloss}>{s.gloss}</span>
              </div>
              {i < SLOTS.length - 1 && <span className={classes.schemaJoin} aria-hidden="true">—</span>}
            </div>
          ))}
        </div>

        <div className={classes.schemaOptional}>
          {PARTIJEN.map(p => (
            <div key={p.tag} className={classes.schemaSlot} data-accent={p.accent} data-optional="true">
              <span className={classes.slotTag}>+ partij {p.tag}</span>
              <span className={classes.slotRole}>{p.role}</span>
              <div className={classes.markerChips}>
                {p.markers.map(m => <span key={m} className={classes.markerChip}>{m}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rules from cat[0] — the explanation behind the diagram. */}
      <ul className={classes.archRules}>
        {participants.rules.map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      {/* The two cat[0] examples — building up from bare to + participants. */}
      {participants.examples && participants.examples.length > 0 && (
        <div className={classes.archExamples}>
          {participants.examples.map((ex, i) => <ExampleRow key={i} ex={ex} />)}
        </div>
      )}

      {/* The full word-order recipe — cat[1] — as an ordered track. */}
      <p className={classes.orderCaption}>De gebruikelijke volgorde in een actieve zin</p>
      <ol className={classes.orderTrack}>
        {ORDER.map((o, i) => (
          <li key={o.label} className={classes.orderStep}>
            <span className={classes.orderNum}>{i + 1}</span>
            <span className={classes.orderLabel}>{o.label}</span>
            <span className={classes.orderMarker}>{o.marker}</span>
          </li>
        ))}
      </ol>

      <ul className={classes.archRules}>
        {wordOrder.rules.slice(2).map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      {wordOrder.examples && wordOrder.examples.length > 0 && (
        <div className={classes.archExamples}>
          {wordOrder.examples.map((ex, i) => <ExampleRow key={i} ex={ex} />)}
        </div>
      )}
    </section>
  )
}

// ─── Movement 2: The connectives ────────────────────────────────────────────
// cat[2] = reason/cause (sebab, karena, sebab itu, karena itu)
// cat[3] = purpose/consequence (supaya tegenover sehingga)

function ConnectiveTile({ cat, accent, index }: { cat: GrammarCategory; accent: string; index: number }) {
  return (
    <article className={classes.connTile} data-accent={accent}>
      <header className={classes.connHeader}>
        <span className={classes.connNumber}>{`0${index + 1}`}</span>
        <h3 className={classes.connTitle}>{cat.title}</h3>
      </header>
      <div className={classes.connBody}>
        <ul className={classes.connRules}>
          {cat.rules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        {cat.examples && cat.examples.length > 0 && (
          <div className={classes.connExamples}>
            {cat.examples.map((ex, i) => <ExampleRow key={i} ex={ex} />)}
          </div>
        )}
      </div>
    </article>
  )
}

const CONN_ACCENTS = ['purple', 'teal'] as const

function ConnectivesSection({ cats }: { cats: GrammarCategory[] }) {
  return (
    <section className={classes.section} aria-labelledby="s-conn">
      <p className={classes.connEyebrow}>Verbindingswoorden</p>
      <h2 id="s-conn" className={classes.sectionTitle}>Reden, doel en gevolg aan elkaar knopen</h2>
      <p className={classes.connCaption}>
        Twee clausules verbinden — en het verbindingswoord zegt of het tweede deel een <em>oorzaak</em>, een <em>beoogd doel</em> of een <em>vanzelf optredend gevolg</em> is.
      </p>
      <div className={classes.connGrid}>
        {cats.map((cat, i) => (
          <ConnectiveTile key={i} cat={cat} accent={CONN_ACCENTS[i % CONN_ACCENTS.length]} index={i} />
        ))}
      </div>
    </section>
  )
}

// ─── Practice teaser — names the four latihan, never the prompts ────────────

const LATIHAN = [
  { num: 'I', label: 'Zet de dialoog "Sepeda motor mogok" om in Indonesische zinnen' },
  { num: 'II', label: 'Puzzel: vertaal de trefwoorden en vind het spreekwoord' },
  { num: 'III', label: 'Kies de juiste BER-, ME- of DI-werkwoordsvorm' },
  { num: 'IV', label: 'Bouw een goede zin uit de losse zinsonderdelen' },
]

function PracticeTeaser() {
  return (
    <section className={classes.section} aria-labelledby="s-teaser">
      <p className={classes.teaserEyebrow}>Latihan</p>
      <h2 id="s-teaser" className={classes.sectionTitle}>Vier oefeningen op zinsbouw</h2>
      <ol className={classes.teaserList}>
        {LATIHAN.map(l => (
          <li key={l.num} className={classes.teaserItem}>
            <span className={classes.teaserNum}>{l.num}</span>
            <span className={classes.teaserLabel}>{l.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson19Page() {
  const activation = useLessonActivation(meta.id)
  const grammar = sections[0].content as { categories: GrammarCategory[] }
  const cats = grammar.categories

  return (
    <article className={classes.page}>
      {/* Hero band — full-bleed, decorated */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
              <span className={classes.heroBadgeTag}>Zinsbouw</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Zinsbouw</span>
              <span className={classes.heroTitleNl}>Hoe een Indonesische zin in elkaar zit</span>
            </h1>
            <p className={classes.heroDescription}>
              <em>Presiden membuka sekolah baru.</em> De president opent een nieuwe school. Voeg er voor wie, waarmee, wanneer en waar aan toe — en de zin groeit zonder van vorm te veranderen. Dit hoofdstuk gaat over de plaats van de woorden, niet over hun vorm.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — sets the page's voice */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Indonesisch verbuigt niet — het <em>ordent</em>. Welke partij vooraan staat, bepaalt waar de nadruk ligt; welke werkwoordsvorm je kiest, bepaalt de volgorde. Begin een zin met <em>Di Denpasar …</em> en je zegt: de plaats is het belangrijkst.
          </p>
          <p className={classes.ledeMeta}>Les 19 · B1 · Grammatica · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — band between the lede and the main content.
          Authored behind a runtime guard: invisible until audio_path is set,
          then it lights up with no page edit. */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} voice={meta.primary_voice ?? undefined} />
          </div>
        </section>
      )}

      {/* Main content — single column, aligned to lede width */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <ArchitectureSection cats={cats} />
          <ConnectivesSection cats={[cats[2], cats[3]]} />
          <PracticeTeaser />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA grouped as one unit */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de zinspatronen en verbindingswoorden verschijnen automatisch in je oefensessies.
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
