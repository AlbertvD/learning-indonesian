// Lesson 20 — Bab 4: Biar Lambat Asal Selamat — bespoke reader page.
//
// Character: a kitchen-and-spice chapter. A Dutch essay on Indonesian bumbu,
// two big vocab inventories (41 spices + 15 taste words), an Indonesian
// reading passage (the Bali ferry tale), its 47-word glossary, and the
// chapter's grammar centrepiece — the nominalising PE-/peN- prefix, taught
// as an allomorphy map of base → derived pairs.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 20 --pretty > src/pages/lessons/lesson-20/content.json

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

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples?: Item[] }

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

// ─── Culture essay — Dutch prologue on Indonesian spice blends ─────────────

function SpiceEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-essay">
      <div className={classes.essayBand}>
        <p className={classes.essayEyebrow}>Het geheim van de kok</p>
        <h2 id="s-essay" className={classes.sectionTitle}>Bumbu-bumbu</h2>
        {c.paragraphs.map((p, i) => (
          <p key={i} className={i === 0 ? classes.essayLead : classes.essayBody}>{p}</p>
        ))}
      </div>
    </section>
  )
}

// ─── Vocabulary — aligned three-column chip grid ───────────────────────────

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
  tone: 'spice' | 'taste' | 'story'
  id: string
}) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={classes.vocabEyebrow} data-tone={tone}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>
        {title} <span className={classes.vocabCount}>{c.items.length} woorden</span>
      </h2>

      <div className={classes.vocabGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.vocabChip} data-tone={tone}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.vocabId}>{item.indonesian}</span>
            <span className={classes.vocabNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Reading passage — the Bali ferry tale, in Indonesian ──────────────────

function ReadingPassage({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-read">
      <div className={classes.readingBand}>
        <p className={classes.readingEyebrow}>Leesverhaal · Bahasa Indonesia</p>
        <h2 id="s-read" className={classes.sectionTitle}>Biar lambat asal selamat</h2>
        <p className={classes.readingProverb}>
          &ldquo;Biar lambat asal selamat&rdquo; — <em>liever langzaam dan onveilig</em>.
          Een veerboot naar Bali, vol wachtende reizigers, en een spreekwoord dat geduld leert.
        </p>
        <div className={classes.readingFlow}>
          {c.paragraphs.map((p, i) => (
            <p key={i} className={classes.readingPara}>
              <span className={classes.readingNum}>{i + 1}</span>
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Grammar — the PE-/peN- nominalising prefix ────────────────────────────
//
// 9 categories. Structure read from the data:
//   0 = concept (what PE- does)
//   1 = "A. no change (L,M,N,NY,R,W,Y)"  — allomorphy
//   2 = "PEM- for B,F"                    — allomorphy
//   3 = "PEN- for C,D,J"                  — allomorphy
//   4 = "PENG- for vowels + G,H"          — allomorphy
//   5 = "B. drop initial (K,P,S,T)"       — allomorphy
//   6 = "PE- exaggeration connotation"    — semantic aside
//   7 = "irregular pe- forms"             — semantic aside
//   8 = "compounds with PE-"              — semantic aside

const ALLOMORPH_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green'] as const

function splitArrow(s: string): [string, string] | null {
  if (!s.includes('→')) return null
  const [a, b] = s.split('→').map(x => x.trim())
  return [a, b]
}

// An example whose Indonesian field is itself a "base → derived" pair renders
// as an aligned transform row; otherwise it's a plain derived-form chip.
function GrammarExamples({ examples, mode }: { examples: Item[]; mode: 'transform' | 'derived' }) {
  if (mode === 'transform') {
    return (
      <div className={classes.transformGrid}>
        {examples.map((ex, j) => {
          const pair = splitArrow(ex.indonesian)
          if (!pair) {
            return (
              <div key={j} className={classes.transform}>
                <span className={classes.transformDerived}>{ex.indonesian}</span>
                <PlayButton src={ex.audioUrl} />
                <span className={classes.transformNl}>{ex.dutch}</span>
              </div>
            )
          }
          const [base, derived] = pair
          return (
            <div key={j} className={classes.transform}>
              <span className={classes.transformBase}>{base}</span>
              <span className={classes.transformArrow}>→</span>
              <span className={classes.transformDerived}>{derived}</span>
              <PlayButton src={ex.audioUrl} />
              <span className={classes.transformNl}>{ex.dutch}</span>
            </div>
          )
        })}
      </div>
    )
  }
  // Derived-only forms (connotation / irregular / compounds): chip list.
  return (
    <div className={classes.derivedGrid}>
      {examples.map((ex, j) => (
        <div key={j} className={classes.derivedChip}>
          <span className={classes.derivedId}>{ex.indonesian}</span>
          <PlayButton src={ex.audioUrl} />
          <span className={classes.derivedNl}>{ex.dutch}</span>
        </div>
      ))}
    </div>
  )
}

function AllomorphTile({ cat, accent, index }: { cat: GrammarCategory; accent: string; index: number }) {
  return (
    <article className={classes.allomorphTile} data-accent={accent}>
      <header className={classes.allomorphHeader}>
        <span className={classes.allomorphNumber}>{`0${index + 1}`}</span>
        <h3 className={classes.allomorphTitle}>{cat.title}</h3>
      </header>
      <ul className={classes.allomorphRules}>
        {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
      </ul>
      {cat.examples && cat.examples.length > 0 && (
        <GrammarExamples examples={cat.examples} mode="transform" />
      )}
    </article>
  )
}

function GrammarConcept({ cat }: { cat: GrammarCategory }) {
  return (
    <div className={classes.conceptBlock}>
      {/* cat.title ("Het voorvoegsel PE-: een handelend persoon of ding") was
          silently dropped by the pre-chapter renderer — nothing rendered it,
          unlike AllomorphTile/SemanticAside which both show cat.title in a
          heading. Fixed here (content-drop, not a chapterization artefact):
          reuse allomorphTitle since no bespoke concept-heading class exists. */}
      <h3 className={classes.allomorphTitle}>{cat.title}</h3>
      <ul className={classes.conceptRules}>
        {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
      </ul>
      {cat.examples && cat.examples.length > 0 && (
        <GrammarExamples examples={cat.examples} mode="derived" />
      )}
    </div>
  )
}

function SemanticAside({ cat, tone }: { cat: GrammarCategory; tone: 'connotation' | 'irregular' | 'compound' }) {
  const eyebrow = tone === 'connotation' ? 'Bijbetekenis' : tone === 'irregular' ? 'Uitzonderingen' : 'In samenstellingen'
  return (
    <aside className={classes.aside} data-tone={tone}>
      <p className={classes.asideEyebrow}>{eyebrow}</p>
      <h3 className={classes.asideTitle}>{cat.title}</h3>
      <ul className={classes.asideRules}>
        {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
      </ul>
      {cat.examples && cat.examples.length > 0 && (
        <GrammarExamples examples={cat.examples} mode="derived" />
      )}
    </aside>
  )
}

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cats = c.categories
  const concept = cats[0]
  const allomorphs = [cats[1], cats[2], cats[3], cats[4], cats[5]].filter(Boolean)
  const connotation = cats[6]
  const irregular = cats[7]
  const compound = cats[8]

  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · Het voorvoegsel PE-</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Van werkwoord naar wie het doet</h2>

      {concept && <GrammarConcept cat={concept} />}

      <p className={classes.allomorphCaption}>
        De vorm van PE- past zich aan de beginklank van het basiswoord aan — net als bij ME-.
      </p>
      <div className={classes.allomorphGrid}>
        {allomorphs.map((cat, i) => (
          <AllomorphTile key={i} cat={cat} accent={ALLOMORPH_ACCENTS[i % ALLOMORPH_ACCENTS.length]} index={i} />
        ))}
      </div>

      <div className={classes.asideGrid}>
        {connotation && <SemanticAside cat={connotation} tone="connotation" />}
        {irregular && <SemanticAside cat={irregular} tone="irregular" />}
        {compound && <SemanticAside cat={compound} tone="compound" />}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps one or more scenes in the shell band the old
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
    /* Hero — spice-market heat. Rendered ABOVE the chapter nav via
       ChapterExperience's hero slot (cover only). */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Biar Lambat Asal Selamat</span>
            <span className={classes.heroTitleNl}>Liever langzaam dan onveilig</span>
          </h1>
          <p className={classes.heroDescription}>
            Een hoofdstuk uit de keuken: het geheim van de Indonesische kruidenmengsels, de woorden
            voor smaak, en een leesverhaal over een trage veerboot naar Bali. En grammaticaal het
            voorvoegsel PE- — dat van een werkwoord de persoon maakt die het doet.
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
            Een verkoper is iemand die <em>verkoopt</em>, een schrijver iemand die schrijft. In het
            Indonesisch maakt één voorvoegsel die stap — en het verandert van vorm naar gelang de klank
            waarmee het woord begint.
          </p>
          <p className={classes.ledeMeta}>Les 20 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — NOT wrapped in Shell: the overview centers itself on
          --lesson-col; nesting would double the horizontal padding. */}
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
          Activeer de les en de kruiden, smaakwoorden en PE-vormen verschijnen automatisch in je oefensessies.
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
//   0 = text (spice essay — "Bumbu-bumbu")
//   1 = vocabulary (41 spices)
//   2 = vocabulary (15 taste words)
//   3 = text (Bali ferry reading passage, Indonesian)
//   4 = vocabulary (glossary for the reading passage)
//   5 = grammar (9 PE- categories)
//   6 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (user feedback 2026-07-07).
    { id: 'inhoud', title: 'Inhoud', node: <InhoudChapter /> },
    { id: 'bumbu', title: 'Bumbu', description: 'Het geheim van de kok: kruidenmengsels, plus 41 kruiden en 15 smaakwoorden.',
      node: (
        <Shell>
          <SpiceEssay section={sections[0]} />
          <VocabGrid section={sections[1]} eyebrow="Kruiden en specerijen" title="Bumbu van A tot Z" tone="spice" id="s-spice" />
          <VocabGrid section={sections[2]} eyebrow="Smaak" title="Zoet, zuur, zout, scherp" tone="taste" id="s-taste" />
        </Shell>
      ) },
    { id: 'feri', title: 'Feri', description: 'Een leesverhaal over de trage veerboot naar Bali, met de bijbehorende woordenschat.',
      node: (
        <Shell>
          <ReadingPassage section={sections[3]} />
          <VocabGrid section={sections[4]} eyebrow="Woordenschat · Bij het verhaal" title="Woorden uit het leesverhaal" tone="story" id="s-story" />
        </Shell>
      ) },
    { id: 'grammatica', title: 'Grammatica', description: 'Het voorvoegsel PE- — van werkwoord naar wie het doet — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar, not on the
              cover (established chapter-experience convention). */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarSection section={sections[5]} /></Shell>
          <AffixTrainerLink affixes={['peN-']} />
        </>
      ) },
    { id: 'oefenen', title: 'Oefenen', description: 'Activeer de les en oefen de kruiden, smaakwoorden en PE-vormen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson20Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
