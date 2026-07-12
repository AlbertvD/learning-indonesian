// Lesson 25 — Ambon sebagai obyek pariwisata (Ambon als toeristenbestemming) —
// bespoke reader page (chapter-experience conversion).
//
// A reportage-shaped lesson: a marine-garden essay, an interview at the Ambon
// tourist office, and the PE-...-AN circumfix. The grammar's heart is the
// uitvoerder / proces / resultaat three-way contrast (penjual · penjualan ·
// jualan) — so the three derivations get a dedicated triptych spread.
//
// Chapters: the cover ("Inhoud" — hero + lede + overview), then "Reportage"
// (the marine-garden essay merges with the tourist-office interview — the
// essay's own closing line, "Kami sedang berbicara dengan seorang pegawai
// dari kantor pariwisata kota Ambon", is the hand-off into the dialogue, so
// the two read as one journalistic piece, not two), "Grammatica" (PE-...-AN,
// with the les-audio), "Woorden" (the 37-item tourism/Ambon vocabulary), then
// "Naslag" (the TELEPON PENTING phone card + the 41-item fauna list — both
// reference asides appended after the lesson's core content, same editorial
// bucket as lesson 2's naslag chapter), then the closing "Oefenen" chapter.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 25 --pretty > src/pages/lessons/lesson-25/content.json

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

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }
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

// Render an Indonesian `a → b → c` arrow chain as an aligned grid so every
// arrow sits on one vertical line. Used in the grammar example grids.
function ArrowChain({ value }: { value: string }) {
  const parts = value.split('→').map((p) => p.trim())
  if (parts.length < 2) return <>{value}</>
  return (
    <span className={classes.chain}>
      {parts.map((p, i) => (
        <span key={i} className={classes.chainStep} style={{ display: 'contents' }}>
          <span className={classes.chainTerm} data-pos={i === 0 ? 'first' : 'rest'}>{p}</span>
          {i < parts.length - 1 && <span className={classes.chainArrow}>→</span>}
        </span>
      ))}
    </span>
  )
}

// ─── 1. Marine-garden essay (intro text) ──────────────────────────────────

function MarineEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-essay">
      <div className={classes.essaySheet}>
        <p className={classes.essayEyebrow}>Reportage · Maluku</p>
        <h2 id="s-essay" className={classes.sectionTitle}>Het mooiste zeetuin van Indonesië</h2>
        <div className={classes.essayBody}>
          {c.paragraphs.map((p, i) => (
            <p key={i} className={classes.essayPara} data-lead={i === 0}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── 2. Dialogue — interview at the tourist office ─────────────────────────

function speakerTone(speaker: string): 'pegawai' | 'wartawan' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('pegawai')) return 'pegawai'
  if (s.includes('wartawan')) return 'wartawan'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { setup?: string; lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Interview · Kantor Pariwisata</p>
        <h2 id="s-dial" className={classes.sectionTitle}>De journalist en de ambtenaar</h2>
        <p className={classes.dialogueSetup}>
          Een wartawan bezoekt het toeristenkantoor van Ambon. Hoe bereik je het eiland — en welke
          rol speelt het toerisme in de toekomst?
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

// ─── 3. Grammar — PE-...-AN, with the three-way contrast as a triptych ─────

// The contrast tile (last category) carries a two-row triplet: pemilih /
// pemilihan / pilihan and penjual / penjualan / jualan. Pulled out for a
// dedicated three-column layout.
const TRIPTYCH = {
  cols: ['Uitvoerder', 'Proces / handeling', 'Resultaat'] as const,
  forms: ['PE-', 'PE-…-AN', '-AN'] as const,
  rows: [
    { id: ['pemilih', 'pemilihan', 'pilihan'], nl: ['de kiezer', 'de verkiezing', 'de keuze'] },
    { id: ['penjual', 'penjualan', 'jualan'], nl: ['de verkoper', 'de verkoop', 'de koopwaar'] },
  ],
}
const TRIPTYCH_TONES = ['amber', 'cyan', 'green'] as const

const GRAMMAR_ACCENTS = ['cyan', 'teal', 'purple'] as const

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cats = c.categories
  // Category 0 = overview (formation); 1–3 = the three application sub-patterns;
  // 4 = the three-way contrast (rendered as the triptych below).
  const overview = cats[0]
  const subPatterns = cats.slice(1, 4)
  const contrastCat = cats[4]

  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · het circumfix</p>
      <h2 id="s-gram" className={classes.sectionTitle}>PE-…-AN — van werkwoord naar zelfstandig naamwoord</h2>

      {/* Overview tile — the formation rule, no example grid (rules carry it) */}
      <article className={classes.overviewTile}>
        <header className={classes.grammarTileHeader}>
          <span className={classes.grammarTileNumber}>00</span>
          <h3 className={classes.grammarTileTitle}>{overview.title}</h3>
        </header>
        <ul className={classes.grammarTileRules}>
          {overview.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
        <div className={classes.overviewExamples}>
          {overview.examples.map((ex, j) => (
            <div key={j} className={classes.overviewExample}>
              <div className={classes.overviewExampleId}>
                <ArrowChain value={ex.indonesian} />
                <PlayButton src={ex.audioUrl} />
              </div>
              <div className={classes.grammarExampleNl}>{ex.dutch}</div>
            </div>
          ))}
        </div>
      </article>

      {/* Three application sub-patterns */}
      <div className={classes.grammarRules}>
        {subPatterns.map((cat, i) => (
          <article key={i} className={classes.grammarTile} data-accent={GRAMMAR_ACCENTS[i % GRAMMAR_ACCENTS.length]}>
            <header className={classes.grammarTileHeader}>
              <span className={classes.grammarTileNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.grammarTileTitle}>{cat.title.replace(/^\d+\.\s*/, '')}</h3>
            </header>
            <div className={classes.grammarTileBody}>
              <ul className={classes.grammarTileRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
              {cat.examples.length > 0 && (
                <div className={classes.grammarTileExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.grammarExample}>
                      <div className={classes.grammarExampleId}>
                        <ArrowChain value={ex.indonesian} />
                        <PlayButton src={ex.audioUrl} />
                      </div>
                      <div className={classes.grammarExampleNl}>{ex.dutch}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* The three-way contrast — the lesson's intellectual heart */}
      {contrastCat && (
        <div className={classes.triptych}>
          <div className={classes.triptychLede}>
            <span className={classes.triptychKicker}>Eén basiswoord, drie vormen</span>
            <p className={classes.triptychNote}>
              Houd ze uit elkaar — dezelfde stam levert via drie afleidingen drie verschillende
              zelfstandige naamwoorden op: de <em>uitvoerder</em>, het <em>proces</em>, en het{' '}
              <em>resultaat</em>.
            </p>
          </div>
          <div className={classes.triptychGrid}>
            {TRIPTYCH.cols.map((col, ci) => (
              <div key={ci} className={classes.triptychHeadCell} data-tone={TRIPTYCH_TONES[ci]}>
                <span className={classes.triptychForm}>{TRIPTYCH.forms[ci]}</span>
                <span className={classes.triptychRole}>{col}</span>
              </div>
            ))}
            {TRIPTYCH.rows.map((row) =>
              row.id.map((term, ci) => {
                const audio = contrastCat.examples.find((e) => e.indonesian.includes(term))?.audioUrl
                return (
                  <div key={`${term}-${ci}`} className={classes.triptychCell} data-tone={TRIPTYCH_TONES[ci]}>
                    <div className={classes.triptychTerm}>
                      {term}
                      {ci === 0 && <PlayButton src={audio} />}
                    </div>
                    <div className={classes.triptychGloss}>{row.nl[ci]}</div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ─── 4. Vocabulary chip grid ───────────────────────────────────────────────

function VocabGrid({
  section,
  eyebrow,
  title,
  tone,
  id,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  tone: 'lush' | 'fauna'
  id: string
}) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={tone === 'fauna' ? classes.faunaEyebrow : classes.vocabEyebrow}>{eyebrow}</p>
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

// ─── 5. Telephone reference card (TELEPON PENTING) ─────────────────────────

function PhoneCard({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const raw = c.paragraphs[0] ?? ''
  // Parse the "Indonesisch : nummer | Nederlands : nummer" rows.
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows = lines
    .filter((l) => l.includes('|') && l.includes(':'))
    .map((l) => {
      const [id, nl] = l.split('|').map((s) => s.trim())
      const num = (id.split(':')[1] ?? '').trim()
      return {
        id: id.split(':')[0].trim(),
        nl: (nl.split(':')[0] ?? '').trim(),
        num,
      }
    })
  const footnote = lines.find((l) => l.startsWith('(*'))

  return (
    <section className={classes.section} aria-labelledby="s-phone">
      <p className={classes.phoneEyebrow}>Naslag · Telepon Penting</p>
      <h2 id="s-phone" className={classes.sectionTitle}>Belangrijke nummers</h2>
      <p className={classes.phoneCaption}>Deze lijst kan ieder moment veranderen.</p>
      <div className={classes.phoneList}>
        {rows.map((r, i) => (
          <div key={i} className={classes.phoneRow}>
            <span className={classes.phoneNum}>{r.num}</span>
            <span className={classes.phoneId}>{r.id}</span>
            <span className={classes.phoneNl}>{r.nl}</span>
          </div>
        ))}
      </div>
      {footnote && <p className={classes.phoneFootnote}>{footnote}</p>}
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

function Hero() {
  return (
    /* Hero band — deep marine teal over the Banda reef. Rendered ABOVE the
       chapter nav via ChapterExperience's hero slot (cover only): the nav
       sits under the hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Ambon, obyek pariwisata</span>
            <span className={classes.heroTitleNl}>Ambon als toeristenbestemming</span>
          </h1>
          <p className={classes.heroDescription}>
            Rond Ambon ligt de mooiste zeetuin van Indonesië, maar weinig toeristen kennen hem.
            Een gesprek op het toeristenkantoor — over kole-kole, kruidnagel en ecotoerisme — en
            het circumfix dat van een werkwoord een naamwoord maakt: penjualan, pendidikan,
            perkebunan.
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
            Eén stam, drie naamwoorden: <em>penjual</em> verkoopt, <em>penjualan</em> is de verkoop,
            en <em>jualan</em> is wat er verkocht wordt. PE-…-AN benoemt de handeling — het proces
            achter het werkwoord.
          </p>
          <p className={classes.ledeMeta}>Les {meta.order_index} · {meta.level} · Bahasa Indonesia</p>
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
          Activeer de les en de woorden, zinnen en patronen verschijnen automatisch in je
          oefensessies.
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
//   0 = text (marine-garden essay — hands off into the interview)
//   1 = dialogue (interview at the Ambon tourist office)
//   2 = vocabulary (37 items — Ambon and tourism)
//   3 = grammar (5 PE-...-AN categories: overview + 3 sub-patterns + triptych)
//   4 = text (TELEPON PENTING phone card)
//   5 = vocabulary (41 items — fauna)
//   6 = exercises (skipped — practice surface)
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
    { id: 'reportage',  title: 'Reportage',  description: 'Het mooiste zeetuin van Indonesië, en een interview op het toeristenkantoor van Ambon.',
      node: <Shell><MarineEssay section={sections[0]} /><DialogueScene section={sections[1]} /></Shell> },
    { id: 'grammatica', title: 'Grammatica', description: 'Het circumfix PE-...-AN: van basiswoord naar zelfstandig naamwoord, met de les-audio.',
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
          <Shell><GrammarSection section={sections[3]} /></Shell>
          <AffixTrainerLink affixes={['-an', 'pe-…-an']} />
        </>
      ) },
    { id: 'woorden',    title: 'Woorden',    description: '37 woorden van Ambon en het toerisme.',
      node: <Shell><VocabGrid section={sections[2]} eyebrow="Woordenschat" title="Woorden van Ambon en het toerisme" tone="lush" id="s-vocab" /></Shell> },
    { id: 'naslag',     title: 'Naslag',     description: 'Belangrijke telefoonnummers en 41 dierennamen, als naslagwerk.',
      node: <Shell><PhoneCard section={sections[4]} /><VocabGrid section={sections[5]} eyebrow="Dieren · Binatang" title="Van olifant tot huishagedis" tone="fauna" id="s-fauna" /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden en het PE-...-AN-patroon.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson25Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
