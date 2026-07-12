// Lesson 18 — Bab 2: Mampir (Even langsgaan) — bespoke reader page.
//
// Character: a warm "visiting friends" narrative dialogue (Joyce & Harry call
// on Jumilah and meet her parents), a large affix-heavy vocabulary list, a
// single idiom, and — the spine of the lesson — passive constructions, plus
// the time markers sudah/telah · sesudah/setelah and the quantifiers
// alle/alles/iedereen. The page is built around the passive: it gets a
// dominant multi-tile "five ways into the passive" treatment, the time and
// quantifier notes read as compact reference spreads beside it.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 18 --pretty > src/pages/lessons/lesson-18/content.json

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
type GrammarExample = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: GrammarExample[] }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

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

// ─── Section: Dialogue — the visit, with a narrator framing the scene ───────

function speakerTone(speaker: string): string {
  const s = speaker.toLowerCase()
  if (s.includes('narrator')) return 'narrator'
  if (s.includes('joyce')) return 'joyce'
  if (s.includes('harry')) return 'harry'
  if (s.includes('jumilah')) return 'jumilah'
  return 'host' // Ayah / Ibu
}

function speakerLabel(speaker: string): string {
  return speaker.toLowerCase() === 'narrator' ? 'Verteller' : speaker
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Op bezoek</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Mampir</h2>

        <p className={classes.dialogueSetup}>
          Joyce en Harry willen even langs bij hun vriendin Jumilah. Ze staan voor de deur, maar er komt geen antwoord — tot Jumilah naar buiten komt rennen. Binnen wachten thee, zelfgebakken cake, en haar ouders.
        </p>

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
                <div className={classes.dialogueSpeaker}>{speakerLabel(line.speaker)}</div>
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

// ─── Section: Passive — the lesson's grammatical spine (five tiles) ─────────
// Each example is an Indonesian → Dutch sentence pair (not a base→derived
// transform), so we render them as a stacked ID/NL pair list under the rules.

const PASSIVE_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green'] as const

function PassiveSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-pass">
      <p className={classes.passiveEyebrow}>Grammatica · De lijdende vorm</p>
      <h2 id="s-pass" className={classes.sectionTitle}>Vijf manieren om passief te zeggen</h2>
      <p className={classes.sectionLede}>
        Indonesisch gebruikt de passieve zin veel vaker dan het Nederlands. Wie de handeling verricht hangt af van de persoon van de agens — en bepaalt de vorm: de di-vorm voor de derde persoon, de kale stam met een voornaamwoord ervoor voor de eerste en tweede.
      </p>

      <div className={classes.passiveStack}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.passiveTile} data-accent={PASSIVE_ACCENTS[i % PASSIVE_ACCENTS.length]}>
            <header className={classes.passiveTileHeader}>
              <span className={classes.passiveTileNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.passiveTileTitle}>{cat.title}</h3>
            </header>
            <div className={classes.passiveTileBody}>
              <ul className={classes.passiveRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
              {cat.examples.length > 0 && (
                <div className={classes.passiveExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.passiveExample}>
                      <div className={classes.passiveExampleId}>
                        <span>{ex.indonesian}</span>
                        <PlayButton src={ex.audioUrl} />
                      </div>
                      <div className={classes.passiveExampleNl}>{ex.dutch}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Time markers — sudah/telah · sesudah/setelah ──────────────────
// Two contrast cards side by side; each pair of meanings + its examples.

function TimeMarkersSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-time">
      <p className={classes.timeEyebrow}>Tijdwoorden · Verwarrend op elkaar lijkend</p>
      <h2 id="s-time" className={classes.sectionTitle}>Al gebeurd, of daarna?</h2>

      <div className={classes.timeGrid}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.timeCard}>
            <h3 className={classes.timeCardTitle}>{cat.title}</h3>
            <ul className={classes.timeRules}>
              {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            <div className={classes.timeExamples}>
              {cat.examples.map((ex, j) => (
                <div key={j} className={classes.timeExample}>
                  <div className={classes.timeExampleId}>
                    <span>{ex.indonesian}</span>
                    <PlayButton src={ex.audioUrl} />
                  </div>
                  <div className={classes.timeExampleNl}>{ex.dutch}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Quantifiers — alle / alles / iedereen ─────────────────────────
// One category whose rules are "Dutch label: indonesian forms" lines and whose
// examples are ID→NL pairs. We render the rules as a labelled legend and the
// examples as an aligned two-column reference table.

function QuantifierSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cat = c.categories[0]
  return (
    <section className={classes.section} aria-labelledby="s-quant">
      <p className={classes.quantEyebrow}>Hoeveelheidswoorden</p>
      <h2 id="s-quant" className={classes.sectionTitle}>Alle, alles, elke, geheel, iedereen</h2>

      <div className={classes.quantLegend}>
        {cat.rules.map((r, j) => {
          const idx = r.indexOf(':')
          if (idx === -1) return <p key={j} className={classes.quantLegendNote}>{r}</p>
          return (
            <p key={j} className={classes.quantLegendRow}>
              <span className={classes.quantLegendLabel}>{r.slice(0, idx)}</span>
              <span className={classes.quantLegendForms}>{r.slice(idx + 1).trim()}</span>
            </p>
          )
        })}
      </div>

      <div className={classes.quantTable}>
        {cat.examples.map((ex, j) => (
          <div key={j} className={classes.quantRow}>
            <span className={classes.quantId}>
              {ex.indonesian}
              <PlayButton src={ex.audioUrl} />
            </span>
            <span className={classes.quantNl}>{ex.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Item list (vocabulary, expressions) ──────────────────────────

function ItemList({
  section,
  eyebrowClass,
  eyebrow,
  title,
  lede,
  tone,
}: {
  section: typeof sections[number]
  eyebrowClass: string
  eyebrow: string
  title: string
  lede?: string
  tone: 'lush' | 'warm'
}) {
  const c = section.content as { items: Item[] }
  const id = `s-${tone}`
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={eyebrowClass}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>
      {lede && <p className={classes.sectionLede}>{lede}</p>}

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

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps ONE OR MORE scenes in the shell band the old
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
    /* Hero — warm "home visit" gradient. Rendered ABOVE the chapter nav via
       ChapterExperience's hero slot (cover only): the nav sits under the
       hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Mampir</span>
            <span className={classes.heroTitleNl}>Even langsgaan</span>
          </h1>
          <p className={classes.heroDescription}>
            Joyce en Harry gaan onaangekondigd langs bij hun vriendin Jumilah. Een hoofdstuk over op bezoek gaan, gastvrijheid en goede manieren — en over de lijdende vorm, het hart van de Indonesische zin.
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
            Wie op bezoek komt, leert de regels. Niet met de linkerhand eten, het glas niet helemaal leegdrinken — en in het Indonesisch <em>zeg je vaak passief wat is gedaan</em>, zonder te benoemen wie het deed.
          </p>
          <p className={classes.ledeMeta}>Les 18 · {meta.level} · Mampir</p>
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
          Activeer de les en de woorden, zinnen en patronen verschijnen automatisch in je oefensessies.
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
//   0 = dialogue (Joyce & Harry visit Jumilah, with a narrator)
//   1 = vocabulary (37 items)
//   2 = expressions (single idiom — omong kosong)
//   3 = grammar — passive (5 categories, the lesson's spine)
//   4 = grammar — time markers (sudah/telah · sesudah/setelah)
//   5 = grammar — quantifiers (alle/alles/iedereen)
//   6 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (matches lesson 5).
    { id: 'inhoud',              title: 'Inhoud',            node: <InhoudChapter /> },
    { id: 'bezoek',              title: 'Bezoek',            description: 'Joyce en Harry gaan langs bij hun vriendin Jumilah — en maken kennis met haar ouders.',
      node: <Shell><DialogueScene section={sections[0]} /></Shell> },
    { id: 'passief',             title: 'Passief',           description: 'Vijf manieren om de lijdende vorm te zeggen — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the lesson's grammatical
              spine (the passive), matching the lesson-5/lesson-2 pattern. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><PassiveSection section={sections[3]} /></Shell>
          <AffixTrainerLink affixes={['di-']} />
        </>
      ) },
    { id: 'tijd-en-hoeveelheid', title: 'Tijd & hoeveelheid', description: 'Sudah/telah, sesudah/setelah, en de woorden voor alle, alles en iedereen.',
      node: <Shell><TimeMarkersSection section={sections[4]} /><QuantifierSection section={sections[5]} /></Shell> },
    { id: 'woorden',             title: 'Woorden',           description: 'Woorden uit het bezoekverhaal, met audio, plus één uitdrukking.',
      node: (
        <Shell>
          <ItemList
            section={sections[1]}
            eyebrowClass={classes.vocabEyebrow}
            eyebrow="Woordenschat"
            title="De woorden van het bezoek"
            lede="Veel van deze woorden komen als werkwoordsstam met hun affix erbij — buat, mem- betekent: stam buat, ME-vorm membuat. Zo zie je meteen welke vorm bij welke betekenis hoort."
            tone="lush"
          />
          <ItemList
            section={sections[2]}
            eyebrowClass={classes.expressionsEyebrow}
            eyebrow="Uitdrukking"
            title="Eén idioom om te onthouden"
            tone="warm"
          />
        </Shell>
      ) },
    { id: 'oefenen',             title: 'Oefenen',           description: 'Activeer de les en oefen de woorden, zinnen en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson18Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
