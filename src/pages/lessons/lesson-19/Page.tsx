// Lesson 19 — Bab 3: Zinsbouw — bespoke reader page (chapter-experience conversion).
//
// Once a grammar-only chapter (its source photos began mid-chapter), lesson 19
// has regained its front pages and is now a full travelogue. Five movements,
// grouped into five content chapters (+ the "Inhoud" cover + the closing
// "Oefenen" chapter):
//
//   1. Dialoog     — "Dari Lombok": Linda and Paul meet again on Bali and Paul
//      recounts his crossing: ferry versus plane, Gunung Rinjani out of reach,
//      a borrowed motorbike that runs dry on a road that turns from asphalt to
//      stones and sand, and the truck that carries them back to Mataram. A
//      route ribbon traces the itinerary the book prints as a little map.
//   2. Woorden      — the words of the journey, green chips.
//   3. Sepeda motor — "Voor de liefhebber": 25 motorcycle parts, set as a
//      workshop parts-inventory with mono index numbers, an enthusiast's extra.
//   4. Zinsbouw     — the intellectual heart (it was the whole lesson until
//      today): a participant SLOT DIAGRAM (agens — handeling — patiens + the
//      optional partijen with their marker words), the word-order TRACK, and
//      the connectives (sebab/karena · supaya tegenover sehingga) as tiles.
//      The lesson audio lives here — it's the grammar-most chapter.
//   5. Latihan      — named, not previewed; the prompts live in the session engine.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 19 --pretty > src/pages/lessons/lesson-19/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples?: Example[] }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }
type ExerciseSub = { title: string; instruction: string; type: string }

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

// ─── Example pair: Indonesisch primary, Nederlands beneath ──────────────────

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

// ─── Movement 1: Dialogue "Dari Lombok" ─────────────────────────────────────
// A narrator sets the scene; Linda and Paul trade the story of the trip.
// A route ribbon (derived from the waypoints named in the dialogue) traces
// the little map the book prints alongside the page.

const ROUTE = ['Denpasar', 'Padang Bai', 'feri · 6 jam', 'Mataram', 'Lombok Utara'] as const

function speakerTone(speaker: string): 'narrator' | 'linda' | 'paul' {
  const s = speaker.toLowerCase()
  if (s.includes('narrator')) return 'narrator'
  if (s.includes('linda')) return 'linda'
  return 'paul'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Reisverhaal</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Dari Lombok</h2>

        <p className={classes.dialogueSetup}>
          Paul is net terug van Lombok en komt Linda weer tegen op Bali. Ze vraagt hoe het was — en Paul
          vertelt: over de veerboot die hij liet schieten, de Gunung Rinjani die te ver bleek, en een geleende
          motor die op een weg vol stenen en zand mogok raakte. Bensin habis.
        </p>

        {/* Route ribbon — the itinerary the book marks on its map of Java, Bali, Lombok */}
        <div className={classes.routeRibbon} aria-label="Reisroute">
          {ROUTE.map((stop, i) => (
            <span key={stop} className={classes.routeStopWrap}>
              <span className={classes.routeStop} data-terminal={i === 0 || i === ROUTE.length - 1}>{stop}</span>
              {i < ROUTE.length - 1 && <span className={classes.routeArrow} aria-hidden="true">→</span>}
            </span>
          ))}
        </div>

        <div className={classes.dialogueLines}>
          {c.lines.map((line, i) => {
            const tone = speakerTone(line.speaker)
            if (tone === 'narrator') {
              return (
                <p key={i} className={classes.narratorLine}>
                  <span className={classes.narratorId}>
                    {line.text}
                    <PlayButton src={line.audioUrl} />
                  </span>
                  <span className={classes.narratorNl}>{line.translation}</span>
                </p>
              )
            }
            return (
              <div key={i} className={classes.dialogueLine} data-speaker-tone={tone}>
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

// ─── Movement 2: Woordenlijst — the words of the journey ────────────────────

function VocabList({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenlijst</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De woorden van de oversteek</h2>
      <p className={classes.sectionLede}>
        Reiswoorden en verhaalwoorden door elkaar — <em>feri</em>, <em>bensin</em>, <em>bengkel</em>,
        <em> mogok</em> — met de verbindingswoorden die de dialoog aan elkaar knopen: <em>sedangkan</em>,
        <em> apalagi</em>, <em>kebetulan</em>.
      </p>
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

// ─── Movement 3: Sepeda motor — a workshop parts-inventory ──────────────────
// The book's playful "voor de liefhebber" extra: 25 labelled parts of a
// motorcycle, laid out like a parts manifest with mono index numbers.

function SepedaMotorSpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-moto">
      <p className={classes.motoEyebrow}>Voor de liefhebber</p>
      <h2 id="s-moto" className={classes.sectionTitle}>Sepeda motor — onderdeel voor onderdeel</h2>
      <p className={classes.sectionLede}>
        De motor waarmee Paul strandde, uit elkaar gehaald. Een werkplaatslijst van namen — van de
        <em> ban</em> tot de <em>knalpot</em> — voor wie graag onder de kap kijkt.
      </p>
      <ol className={classes.partsGrid}>
        {c.items.map((item, i) => (
          <li key={i} className={classes.partRow}>
            <span className={classes.partNum}>{String(i + 1).padStart(2, '0')}</span>
            <span className={classes.partBody}>
              <span className={classes.partIdRow}>
                <span className={classes.partId}>{item.indonesian}</span>
                <PlayButton src={item.audioUrl} />
              </span>
              <span className={classes.partNl}>{item.dutch}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── Movement 4: Tata Bahasa · Zinsbouw ─────────────────────────────────────
// cat[0] = participants (agens/patiens + partij 3/4 + marker words)
// cat[1] = the usual word order in an active sentence
// cat[2] = reason / cause (sebab, karena, sebab itu, karena itu)
// cat[3] = purpose / consequence (supaya tegenover sehingga)

const SLOTS = [
  { tag: '1', role: 'agens', gloss: 'wie de handeling uitvoert', accent: 'cyan' },
  { tag: 'V', role: 'handeling', gloss: 'de werkwoordsvorm', accent: 'amber' },
  { tag: '2', role: 'patiens', gloss: 'wie de handeling ondergaat', accent: 'purple' },
] as const

const PARTIJEN = [
  { tag: '3', role: 'voor wie / waarvoor', markers: ['bagi', 'buat', 'kepada', 'untuk'], accent: 'teal' },
  { tag: '4', role: 'met wie / waarmee', markers: ['dengan', 'sama', 'tanpa'], accent: 'green' },
] as const

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
      <p className={classes.archEyebrow}>Tata Bahasa · Zinsbouw</p>
      <h2 id="s-arch" className={classes.sectionTitle}>Wie doet wat, voor wie, waarmee</h2>

      {/* The participant slot diagram — the visual heart of the chapter */}
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

      <ul className={classes.archRules}>
        {participants.rules.map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      {participants.examples && participants.examples.length > 0 && (
        <div className={classes.archExamples}>
          {participants.examples.map((ex, i) => <ExampleRow key={i} ex={ex} />)}
        </div>
      )}

      {/* The full word-order recipe — cat[1] — as an ordered track */}
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
        {/* wordOrder.rules[1] (the literal "tijdsbepaling — partij 1 — ..."
            enumeration) is re-expressed above as the ORDER track, so it's
            skipped here. The old `.slice(2)` also dropped rules[0] — a
            distinct, general statement ("naast de partijen kan een zin
            bepalingen van tijd, wijze en plaats bevatten") that appears
            nowhere else on the page. Content-parity test caught this;
            fixed by skipping only the redundant index (1), not both. */}
        {wordOrder.rules.filter((_, i) => i !== 1).map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      {wordOrder.examples && wordOrder.examples.length > 0 && (
        <div className={classes.archExamples}>
          {wordOrder.examples.map((ex, i) => <ExampleRow key={i} ex={ex} />)}
        </div>
      )}
    </section>
  )
}

const CONN_ACCENTS = ['purple', 'teal'] as const

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

function ConnectivesSection({ cats }: { cats: GrammarCategory[] }) {
  return (
    <section className={classes.section} aria-labelledby="s-conn">
      <p className={classes.connEyebrow}>Verbindingswoorden</p>
      <h2 id="s-conn" className={classes.sectionTitle}>Reden, doel en gevolg aan elkaar knopen</h2>
      <p className={classes.connCaption}>
        Twee clausules verbinden — en het verbindingswoord zegt of het tweede deel een <em>oorzaak</em>,
        een <em>beoogd doel</em> of een <em>vanzelf optredend gevolg</em> is.
      </p>
      <div className={classes.connGrid}>
        {cats.map((cat, i) => (
          <ConnectiveTile key={i} cat={cat} accent={CONN_ACCENTS[i % CONN_ACCENTS.length]} index={i} />
        ))}
      </div>
    </section>
  )
}

// ─── Movement 5: Latihan — named, not previewed ─────────────────────────────
// The exercise prompts are the session engine's content; the reader gets only
// the four latihan titles + their instruction, drawn straight from the data.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const

function LatihanTeaser({ section }: { section: typeof sections[number] }) {
  const c = section.content as { sections: ExerciseSub[] }
  return (
    <section className={classes.section} aria-labelledby="s-lat">
      <p className={classes.latEyebrow}>Latihan</p>
      <h2 id="s-lat" className={classes.sectionTitle}>Vier oefeningen op zinsbouw</h2>
      <ol className={classes.latList}>
        {c.sections.map((sub, i) => (
          <li key={i} className={classes.latItem}>
            <span className={classes.latNum}>{ROMAN[i]}</span>
            <span className={classes.latBody}>
              <span className={classes.latTitle}>{sub.title.replace(/^Latihan\s+[IVX]+\s+—\s+/, '')}</span>
              <span className={classes.latInstruction}>{sub.instruction}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps scenes in the shell band the old single
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
    /* Hero — full-bleed, warm travelogue mood. Rendered ABOVE the chapter nav
       via ChapterExperience's hero slot (cover only): the nav sits under the
       hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            <span className={classes.heroBadgeTag}>Bab 3 · Zinsbouw</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Dari Lombok</span>
            <span className={classes.heroTitleNl}>Terug van Lombok — en de bouw van de zin</span>
          </h1>
          <p className={classes.heroDescription}>
            Paul komt terug van Lombok met een verhaal: geen veerboot maar het vliegtuig, de Gunung Rinjani
            net niet gehaald, en een geleende motor die stilviel toen de weg veranderde <em>dari aspal
            menjadi batu-batu dan pasir</em>. En onder het reisverhaal ligt de grammatica van dit hoofdstuk:
            hoe een Indonesische zin in elkaar zit.
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
            Een goed reisverhaal en een goede zin bouw je op dezelfde manier: <em>wie</em> doet <em>wat</em>,
            voor wie, waarmee, wanneer en waar. Indonesisch verbuigt niet — het <em>ordent</em>. Zet
            <em> Di Denpasar …</em> vooraan en je zegt: de plaats is het belangrijkst.
          </p>
          <p className={classes.ledeMeta}>Les 19 · {meta.level} · Selamat Datang 2 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview. NOT wrapped in Shell: the
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
          Activeer de les en de woorden, zinnen en zinspatronen verschijnen automatisch in je oefensessies.
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
//   0 = dialogue ("Dari Lombok")
//   1 = vocabulary (words of the journey)
//   2 = vocabulary (sepeda motor parts)
//   3 = grammar (4 categories: participants, word order, reason, purpose)
//   4 = exercises (named only — Latihan teaser)
//
// The grammar section's 4 categories split across two chapter scenes:
// cats[0..1] (participants + word order) form ArchitectureSection; cats[2..3]
// (reason/cause + purpose/consequence) form ConnectivesSection. Both live in
// the "Zinsbouw" chapter, which is also where the lesson audio lives (the
// grammar-most chapter).
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  const grammar = sections[3].content as { categories: GrammarCategory[] }
  const cats = grammar.categories

  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story.
    { id: 'inhoud', title: 'Inhoud', node: <InhoudChapter /> },
    { id: 'dialoog', title: 'Dialoog', description: 'Paul vertelt Linda over zijn tocht van Lombok terug naar Bali — met een reisroute-ribbon.',
      node: <Shell><DialogueScene section={sections[0]} /></Shell> },
    { id: 'woorden', title: 'Woorden', description: 'De woorden van de oversteek: reiswoorden en de verbindingswoorden uit de dialoog.',
      node: <Shell><VocabList section={sections[1]} /></Shell> },
    { id: 'sepeda-motor', title: 'Sepeda motor', description: 'Voor de liefhebber: 25 onderdelen van de motor waarmee Paul strandde.',
      node: <Shell><SepedaMotorSpread section={sections[2]} /></Shell> },
    { id: 'zinsbouw', title: 'Zinsbouw', description: 'Wie doet wat, voor wie en waarmee — het volledige zinsbouwschema, met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar — the
              grammar-most chapter. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell>
            <ArchitectureSection cats={cats} />
            <ConnectivesSection cats={[cats[2], cats[3]]} />
          </Shell>
        </>
      ) },
    { id: 'latihan', title: 'Latihan', description: 'Vier oefeningen op zinsbouw, klaar om te maken.',
      node: <Shell><LatihanTeaser section={sections[4]} /></Shell> },
    { id: 'oefenen', title: 'Oefenen', description: 'Activeer de les en oefen de woorden en zinspatronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson19Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
