// Lesson 22 — Bab 6: Pesta Pernikahan (Het bruiloftsfeest) — bespoke reader page
// (chapter-experience conversion).
//
// The chapter is a family chapter: a wedding at the Murjito household, a kinship
// schema that names every relation in the story, the colours of Indonesian, and
// a deep reduplication (verdubbeling) grammar set. The story leads, the kinship
// schema follows as a generational tree, the vocabulary (plus the one wedding
// congratulation) shares a chapter, then the reduplication grammar (with the
// lesson audio) and finally the colour swatches.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 22 --pretty > src/pages/lessons/lesson-22/content.json

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

// ─── Section: Story — the chapter's reading text ───────────────────────────

function StoryText({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-story">
      <div className={classes.storyBand}>
        <p className={classes.storyEyebrow}>Het verhaal</p>
        <h2 id="s-story" className={classes.sectionTitle}>Pesta pernikahan bij de familie Murjito</h2>
        <div className={classes.storyProse}>
          {c.paragraphs.map((p, i) => (
            <p key={i} className={i === 0 ? classes.storyLead : undefined}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section: Kinship reference table — the who's-who of the story ─────────

type RefRow = { cells: string[]; label: string }
type RefSection = { rows: RefRow[]; heading: string }
type RefExample = { dutch: string; indonesian: string }

function KinshipTable({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    intro: string
    columns: string[]
    examples: RefExample[]
    sections: RefSection[]
    footnotes: string[]
    tableTitle: string
  }
  return (
    <section className={classes.section} aria-labelledby="s-kin">
      <p className={classes.kinEyebrow}>Stamboom · Wie is wie</p>
      <h2 id="s-kin" className={classes.sectionTitle}>{c.tableTitle}</h2>

      <p className={classes.kinIntro}>{c.intro}</p>

      <div className={classes.kinTree}>
        {c.sections.map((sec, si) => (
          <div key={si} className={classes.kinGen} data-gen={si}>
            <div className={classes.kinGenHead}>
              <span className={classes.kinGenTick}>{`0${si + 1}`}</span>
              <h3 className={classes.kinGenTitle}>{sec.heading}</h3>
            </div>
            <div className={classes.kinRows}>
              {sec.rows.map((row, ri) => (
                <div key={ri} className={classes.kinRow}>
                  <span className={classes.kinId}>{row.cells[0]}</span>
                  <span className={classes.kinNl}>{row.cells[1]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={classes.kinExamples}>
        {c.examples.map((ex, i) => (
          <div key={i} className={classes.kinExample}>
            <div className={classes.kinExampleId}>{ex.indonesian}</div>
            <div className={classes.kinExampleNl}>{ex.dutch}</div>
          </div>
        ))}
      </div>

      {c.footnotes.length > 0 && (
        <ul className={classes.kinFootnotes}>
          {c.footnotes.map((fn, i) => <li key={i}>{fn}</li>)}
        </ul>
      )}
    </section>
  )
}

// ─── Section: Vocabulary — chip grid ───────────────────────────────────────

type Item = { dutch: string; indonesian: string; audioUrl?: string }

function VocabGrid({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De taal van de bruiloft en de familie</h2>

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

// ─── Section: Expressions — the congratulation ─────────────────────────────

function Expressions({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.exprEyebrow}>Uitdrukking</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Wat je zegt op de bruiloft</h2>

      <div className={classes.exprGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.exprCard}>
            <div className={classes.exprIdRow}>
              <span className={classes.exprId}>{item.indonesian}</span>
              <PlayButton src={item.audioUrl} />
            </div>
            <div className={classes.exprNl}>{item.dutch}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Grammar — reduplication (verdubbelingen) ─────────────────────

type GrammarExample = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: GrammarExample[] }

const GRAMMAR_ACCENTS = ['purple', 'teal', 'cyan', 'rose'] as const

// Split an Indonesian example on an embedded arrow so the pair aligns.
function splitArrow(s: string): { left: string; right: string } | null {
  const m = s.split(/\s*→\s*/)
  if (m.length === 2) return { left: m[0], right: m[1] }
  return null
}

function GrammarReduplication({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.gramEyebrow}>Verdubbelingen</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Eén woord, twee keer — en wat dat betekent</h2>
      <p className={classes.gramLede}>
        Indonesisch verdubbelt graag. Een verdubbeling is zelden zomaar een meervoud — ze kleurt het
        woord: wederkerig, intensief, divers, of ze is gewoon een vast woord dat altijd dubbel klinkt.
        Hieronder negen patronen, van het werkwoord tot de kleuren.
      </p>

      <div className={classes.gramTiles}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.gramTile} data-accent={GRAMMAR_ACCENTS[i % GRAMMAR_ACCENTS.length]}>
            <header className={classes.gramTileHead}>
              <span className={classes.gramTileNum}>{String(i + 1).padStart(2, '0')}</span>
              <h3 className={classes.gramTileTitle}>{cat.title}</h3>
            </header>
            <ul className={classes.gramRules}>
              {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {cat.examples.length > 0 && (
              <div className={classes.gramExamples}>
                {cat.examples.map((ex, j) => {
                  const arrow = splitArrow(ex.indonesian)
                  return (
                    <div key={j} className={classes.gramExample}>
                      <div className={classes.gramExampleIdRow}>
                        {arrow ? (
                          <span className={classes.gramArrowPair}>
                            <span className={classes.gramArrowLeft}>{arrow.left}</span>
                            <span className={classes.gramArrowGlyph}>→</span>
                            <span className={classes.gramArrowRight}>{arrow.right}</span>
                          </span>
                        ) : (
                          <span className={classes.gramExampleId}>{ex.indonesian}</span>
                        )}
                        <PlayButton src={ex.audioUrl} />
                      </div>
                      <div className={classes.gramExampleNl}>{ex.dutch}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Colours — swatch grid ────────────────────────────────────────
// Map Indonesian colour words to an approximate hex swatch dot. Compound /
// reduplicated tints fall back to a tinted question swatch (still a dot, just
// neutral) so the section stays a coherent palette.

const COLOUR_SWATCH: Record<string, string> = {
  'abu-abu / kelabu': '#9aa0a6',
  biru: '#3b82f6',
  coklat: '#8b5a2b',
  hijau: '#16a34a',
  hitam: '#1c1c1e',
  kuning: '#f5c518',
  merah: '#e23b3b',
  oranye: '#f97316',
  perak: '#c0c4cc',
  putih: '#f4f4f5',
  ungu: '#7c3aed',
  'hijau muda': '#86efac',
  'hijau tua': '#15803d',
  'biru laut': '#1e3a8a',
  'coklat sawo': '#6b4423',
  'merah jambu': '#f472b6',
  'warna terong': '#5b2a6b',
  'kebiru-biruan': '#93c5fd',
  'keemas-emasan': '#d4af37',
  'kehitam-hitaman': '#3f3f46',
  'hijau kebiru-biruan': '#4cb39b',
  'coklat kekuning-kuningan': '#b08442',
  'kuning keabu-abuan': '#d6cfb0',
}

function ColourGrid({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-col">
      <p className={classes.colEyebrow}>Warna · De kleuren</p>
      <h2 id="s-col" className={classes.sectionTitle}>Kleuren, tinten en het Indonesische &ldquo;-achtig&rdquo;</h2>
      <p className={classes.colLede}>
        De basiskleuren staan vooraan; daarna de nuances. Een lichte tint krijgt <em>muda</em>, een donkere{' '}
        <em>tua</em>; een &ldquo;-achtige&rdquo; kleur vormt de ke-…-an verdubbeling: biru → kebiru-biruan.
      </p>

      <div className={classes.colGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.colChip}>
            <span
              className={classes.colSwatch}
              style={{ background: COLOUR_SWATCH[item.indonesian] ?? 'var(--bg-hover)' }}
              aria-hidden="true"
            />
            <span className={classes.colText}>
              <span className={classes.colIdRow}>
                <span className={classes.colId}>{item.indonesian}</span>
                <PlayButton src={item.audioUrl} />
              </span>
              <span className={classes.colNl}>{item.dutch}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps ONE or TWO scenes in the shell band the old
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
    /* Hero band — full-bleed, rose + gold ceremonial warmth. Rendered ABOVE
       the chapter nav via ChapterExperience's hero slot (cover only): the
       nav sits under the hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Pesta Pernikahan</span>
            <span className={classes.heroTitleNl}>Het bruiloftsfeest</span>
          </h1>
          <p className={classes.heroDescription}>
            Titi, de tweede dochter van de familie Murjito, gaat trouwen. Ooms, tantes, opa en oma,
            een zwager uit Yogyakarta — het hele huis loopt vol. Een hoofdstuk over familie: wie
            hoort bij wie, de kleuren van het feest, en de Indonesische verdubbeling.
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
            Geen feest <em>zonder bibi Ratna</em>. In het Indonesisch heeft elke band zijn eigen woord —
            oudere broer en jongere broer zijn niet hetzelfde, en een neef via je oom is een ander
            woord dan een neef via je zus.
          </p>
          <p className={classes.ledeMeta}>Les 22 · {meta.level} · Bahasa Indonesia</p>
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
          Activeer de les en de woorden, de familierelaties en de verdubbelingen verschijnen
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
//   0 = text (the story — Pesta pernikahan bij de familie Murjito)
//   1 = vocabulary (43 items — wedding + family)
//   2 = expressions (Selamat menempuh hidup baru — the one congratulation)
//   3 = reference_table (kinship schema)
//   4 = grammar (9 reduplication categories)
//   5 = vocabulary (colours)
//   6 = exercises (skipped — practice surface)
//
// Editorial merge: Woorden (vocab, section 1) and Uitdrukking (section 2) —
// the single congratulation phrase — share one chapter. Section 2 is a
// single-item card; it reads as an appendix to the wedding vocabulary rather
// than earning its own chapter (same editorial-merge logic as lesson 5's
// TussendoorSpread).
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
    { id: 'verhaal',    title: 'Verhaal',    description: 'Titi trouwt bij de familie Murjito — het verhaal van de bruiloft.',
      node: <Shell><StoryText section={sections[0]} /></Shell> },
    { id: 'familie',    title: 'Familie',    description: 'De familierelaties op een rij: van nenek moyang tot cucu.',
      node: <Shell><KinshipTable section={sections[3]} /></Shell> },
    { id: 'woorden',    title: 'Woorden',    description: '43 woorden van bruiloft en familie, en de felicitatie die je op zo’n feest zegt.',
      node: <Shell><VocabGrid section={sections[1]} /><Expressions section={sections[2]} /></Shell> },
    { id: 'grammatica', title: 'Grammatica', description: 'Negen verdubbelingspatronen — van het werkwoord tot de kleuren, met de les-audio.',
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
          <Shell><GrammarReduplication section={sections[4]} /></Shell>
          <AffixTrainerLink affixes={['reduplication', 'reduplication-an', 'ke-…-an-reduplication']} />
        </>
      ) },
    { id: 'kleuren',    title: 'Kleuren',    description: 'De Indonesische kleuren, tinten en het ‘-achtige’ achtervoegsel.',
      node: <Shell><ColourGrid section={sections[5]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden, familietermen en verdubbelingen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson22Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
