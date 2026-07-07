// Lesson 5 — Belajar (Studeren) — bespoke reader page.
//
// The lesson's hinge is the Indonesian pronoun system, with the kita/kami
// (inclusive/exclusive "wij") distinction as the headline insight.  The
// dialogue stages it through children's voices ("Kita harus belajar di rumah" —
// "Kami mau ke luar"), the grammar names it, and the reference table maps the
// whole possessive matrix.  Two short culture texts (rice cookery and the
// Sunda-Kelapa → Jakarta etymology) sit as a closing "Tussendoor" bookend.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 5 --pretty > src/pages/lessons/lesson-5/content.json

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
          {playing
            ? <><rect x="2" y="2" width="3" height="8" /><rect x="7" y="2" width="3" height="8" /></>
            : <polygon points="3,1 11,6 3,11" />}
        </svg>
      </button>
      <audio ref={ref} src={src} preload="none" onEnded={() => setPlaying(false)} />
    </>
  )
}

// ─── Section: Dialogue — kids vs. pembantu in the kitchen ──────────────────

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

function speakerTone(speaker: string): 'titin' | 'nanang' | 'pembantu' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('titin')) return 'titin'
  if (s.includes('nanang')) return 'nanang'
  if (s.includes('pembantu')) return 'pembantu'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { intro?: string; lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · In de keuken</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Kita harus belajar</h2>

        {c.intro && <p className={classes.dialogueSetup}>{c.intro}</p>}

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

// ─── Section: Grammar — seven pronoun families ─────────────────────────────

type GrammarCategory = {
  title: string
  rules: string[]
  examples: Array<{ dutch: string; indonesian: string; audioUrl?: string }>
}

// Accent rotation across the seven pronoun families.  Category index 5
// (kita/kami) gets the headline cyan treatment — that's the editorial moment.
const PRONOUN_ACCENT: Array<'cyan' | 'purple' | 'teal' | 'amber' | 'green' | 'spotlight' | 'orange'> = [
  'amber',     // saya / aku / eigen naam
  'teal',      // jij — beleefdste vorm
  'purple',    // u — Tuan/Nyonya/Anda
  'green',     // kakak / adik / abang
  'orange',    // dia / ia / beliau
  'spotlight', // wij — kita vs. kami  (the headline)
  'cyan',      // jullie + meervoud
]

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Voornaamwoorden · Zeven families</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Hoe je naar elkaar verwijst</h2>

      <div className={classes.pronounStack}>
        {c.categories.map((cat, i) => {
          const accent = PRONOUN_ACCENT[i] ?? 'cyan'
          const isSpotlight = accent === 'spotlight'
          return (
            <article
              key={i}
              className={isSpotlight ? classes.pronounSpotlight : classes.pronounTile}
              data-accent={accent}
            >
              <header className={classes.pronounHeader}>
                <span className={classes.pronounIndex}>{`P.${String(i + 1).padStart(2, '0')}`}</span>
                <h3 className={classes.pronounTitle}>{cat.title}</h3>
              </header>
              <div className={classes.pronounBody}>
                <ul className={classes.pronounRules}>
                  {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
                </ul>
                {cat.examples.length > 0 && (
                  <div className={classes.pronounExamples}>
                    {cat.examples.map((ex, j) => (
                      <div key={j} className={classes.pronounExample}>
                        <div className={classes.pronounExampleId}>
                          {ex.indonesian}
                          <PlayButton src={ex.audioUrl} />
                        </div>
                        <div className={classes.pronounExampleNl}>{ex.dutch}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

// ─── Section: Reference table — possessive pronoun matrix ──────────────────

type RefRow = { cells: string[]; label: string }
type RefSection = { rows: RefRow[]; heading: string }
type RefExample = { dutch: string; indonesian: string }

function ReferenceTable({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    intro: string
    columns: string[]
    examples: RefExample[]
    sections: RefSection[]
    footnotes: string[]
    tableTitle: string
  }
  const introParas = c.intro.split(/\n\n+/).filter(Boolean)
  return (
    <section className={classes.section} aria-labelledby="s-ref">
      <p className={classes.referenceEyebrow}>Bezittelijk · Het schema</p>
      <h2 id="s-ref" className={classes.sectionTitle}>{c.tableTitle}</h2>

      <div className={classes.referenceIntro}>
        {introParas.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <div className={classes.referenceTableWrap}>
        <table className={classes.referenceTable}>
          <thead>
            <tr>
              <th scope="col" className={classes.referenceLabelCol}>{c.columns[0] || ''}</th>
              {c.columns.slice(1).map((col, i) => (
                <th key={i} scope="col" className={classes.referenceCol}>{col}</th>
              ))}
            </tr>
          </thead>
          {c.sections.map((sec, si) => (
            <tbody key={si} className={classes.referenceBlock}>
              <tr className={classes.referenceBlockHead}>
                <th scope="rowgroup" colSpan={c.columns.length}>{sec.heading}</th>
              </tr>
              {sec.rows.map((row, ri) => (
                <tr key={ri}>
                  <th scope="row" className={classes.referenceLabel}>{row.label}</th>
                  {row.cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={classes.referenceCell}
                      data-empty={cell.trim() === '-' || cell.trim() === ''}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <p className={classes.referenceExamplesHeading}>Voorbeelden in gebruik</p>
      <div className={classes.referenceExamples}>
        {c.examples.map((ex, i) => (
          <div key={i} className={classes.referenceExample}>
            <div className={classes.referenceExampleId}>{ex.indonesian}</div>
            <div className={classes.referenceExampleNl}>{ex.dutch}</div>
          </div>
        ))}
      </div>

      {c.footnotes.length > 0 && (
        <div className={classes.referenceFootnotes}>
          {c.footnotes.map((fn, i) => <p key={i}>{fn}</p>)}
        </div>
      )}
    </section>
  )
}

// ─── Section: Vocabulary — reference grid ──────────────────────────────────

type VocabItem = { dutch: string; indonesian: string; audioUrl?: string }

function VocabularyReference({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: VocabItem[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · 53 items</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Woorden uit huis en keuken</h2>

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

// ─── Section: Tussendoor — two short cultural digressions as a bookend ─────

function TussendoorSpread({
  cookerySection,
  historySection,
}: {
  cookerySection: typeof sections[number]
  historySection: typeof sections[number]
}) {
  const cookery = cookerySection.content as { paragraphs: string[] }
  const history = historySection.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-tussen">
      <p className={classes.tussenEyebrow}>Tussendoor · Twee zijpaden</p>
      <h2 id="s-tussen" className={classes.sectionTitle}>Rijst en stadsnamen</h2>
      <p className={classes.sectionLede}>
        Het lesboek leest soms als een reisdagboek — het laat de grammatica even
        rusten en wandelt af naar de keuken of de havengeschiedenis. Hieronder
        twee korte zijpaden uit deze les: een recept voor nasi gurih, en het
        ontstaan van de naam Jakarta.
      </p>

      <article className={classes.tussenArticle} data-flavour="kitchen">
        <header className={classes.tussenArticleHead}>
          <span className={classes.tussenKicker}>Recept</span>
          <h3 className={classes.tussenTitle}>Nasi gurih · rijst met santan</h3>
        </header>
        <div className={classes.tussenProse}>
          {cookery.paragraphs.map((p, i) => {
            // "Nasi gurih"/"Nasi kuning" paragraphs open a sub-recipe: first
            // line is a display header, the rest is prose. (The pre-chapter
            // version dropped everything after the first line — a content
            // loss the chapter parity test caught, fixed 2026-07-07.)
            if (p.startsWith('Nasi kuning') || p.startsWith('Nasi gurih')) {
              const [head, ...rest] = p.split('\n')
              const prose = rest.join(' ').trim()
              return (
                <div key={i}>
                  <h4 className={classes.tussenSubhead}>{head}</h4>
                  {prose && <p>{prose}</p>}
                </div>
              )
            }
            // Ingredient lists (start with "Benodigdheden") — render as a
            // structured ingredients block.
            if (p.startsWith('Benodigdheden')) {
              const lines = p.split('\n').map(s => s.trim()).filter(Boolean)
              const heading = lines[0]
              const items = lines.slice(1).flatMap(l => l.split(',').map(s => s.trim().replace(/^[–-]\s*/, ''))).filter(Boolean)
              return (
                <div key={i} className={classes.tussenIngredients}>
                  <p className={classes.tussenIngredientsHead}>{heading}</p>
                  <ul>
                    {items.map((item, j) => <li key={j}>{item}</li>)}
                  </ul>
                </div>
              )
            }
            return <p key={i}>{p}</p>
          })}
        </div>
      </article>

      <article className={classes.tussenArticle} data-flavour="history">
        <header className={classes.tussenArticleHead}>
          <span className={classes.tussenKicker}>Geschiedenis</span>
          <h3 className={classes.tussenTitle}>Sunda Kelapa wordt Jakarta</h3>
        </header>
        <div className={classes.tussenProse}>
          {history.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <p className={classes.tussenEtymology}>
          <span>Sunda Kelapa</span>
          <span aria-hidden="true">→</span>
          <span>Jayakarta</span>
          <span aria-hidden="true">→</span>
          <span>Jakatra</span>
          <span aria-hidden="true">→</span>
          <span className={classes.tussenEtymologyFinal}>Jakarta</span>
        </p>
      </article>
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

function VerhaalChapter() {
  return (
    <>
      {/* Hero — classroom warm tones, evoke "studying at the table" */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Belajar</span>
              <span className={classes.heroTitleNl}>Studeren — en wie precies "wij" is</span>
            </h1>
            <p className={classes.heroDescription}>
              Titin en Nanang moeten thuis studeren terwijl hun ouders naar Taman
              Mini gaan. Tussen het mopperen door zeggen ze <em>kita</em> en{' '}
              <em>kami</em> — twee woorden voor "wij", afhankelijk van wie er
              meeluistert. Deze les opent het volledige Indonesische voornaam­woord­systeem.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Indonesisch heeft <em>twee woorden voor "wij"</em>: één waarin de
            aangesprokene meedoet, en één waarin hij erbuiten staat. Wie dat
            onderscheid hoort, hoort precies wie er bij de groep hoort en wie niet.
          </p>
          <p className={classes.ledeMeta}>Les 5 · A1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio */}
      <LessonGrammarAudioBand
        nl={meta.lesson_audio_url}
        en={meta.lesson_audio_url_en}
        bandClassName={classes.audioBand}
        innerClassName={classes.audioInner}
      />

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter (user feedback, 2026-07-07).
          NOT wrapped in Shell: the overview centers itself on --lesson-col;
          nesting would double the horizontal padding (992 vs 1024). */}
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
          Activeer de les — de pronominale families en het bezittelijke schema
          verschijnen daarna gedoseerd in je oefensessies.
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
//   0 = text (rice cookery)
//   1 = dialogue (Titin + Nanang + Pembantu)
//   2 = grammar (7 pronoun categories)
//   3 = reference_table (possessive matrix)
//   4 = exercises (skipped — practice surface)
//   5 = text (Jakarta etymology)
//   6 = vocabulary
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    { id: 'verhaal',    title: 'Verhaal',    node: <VerhaalChapter /> },
    { id: 'dialoog',    title: 'Dialoog',    description: 'Titin en Nanang mopperen in de keuken — en zeggen twee soorten "wij".',
      node: <Shell><DialogueScene section={sections[1]} /></Shell> },
    { id: 'grammatica', title: 'Grammatica', description: 'Zeven voornaamwoord-families, van saya tot kita versus kami.',
      node: <Shell><GrammarSection section={sections[2]} /></Shell> },
    { id: 'schema',     title: 'Schema',     description: 'Het volledige bezittelijk-voornaamwoordschema als naslagtabel.',
      node: <Shell><ReferenceTable section={sections[3]} /></Shell> },
    { id: 'woorden',    title: 'Woorden',    description: '53 woorden uit huis en keuken, met audio.',
      node: <Shell><VocabularyReference section={sections[6]} /></Shell> },
    { id: 'tussendoor', title: 'Tussendoor', description: 'Twee zijpaden: nasi gurih koken en hoe Sunda Kelapa Jakarta werd.',
      node: <Shell><TussendoorSpread cookerySection={sections[0]} historySection={sections[5]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson5Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} chapters={buildChapters(activation)} />
    </article>
  )
}
