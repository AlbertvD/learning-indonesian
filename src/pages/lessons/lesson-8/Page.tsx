// Lesson 8 — Batik — bespoke reader page.
//
// Two threads run through this lesson and the page composes them as one piece:
//
//   1) The craft.  A 12-paragraph culture spread that walks from the 16th
//      century Java onward — canting and warm wax, batik tulis vs batik cap,
//      the secret wax/dye recipes, the parang rusak motif reserved for the
//      Yogyakarta and Surakarta courts. The single most visual fragment in
//      the dataset is paragraph 7: "Schema batikproces: a → b → c → … → i" —
//      a nine-step ladder we render literally as a numbered horizontal flow.
//
//   2) The grammar.  Ibu Yati and her daughter Tin haggle for a kain panjang
//      at Sarinah Jaya: "yang ini lebih bagus", "warnanya paling bagus",
//      "tidak terlalu modern", "lebih bagus daripada". The lesson's grammar
//      section is a ten-rung ladder of comparison: bagus → lebih bagus →
//      paling bagus → terbagus → sebagus → kurang bagus → makin → tak ...
//      We render that ladder as ten stacked horizontal spreads, each rung
//      carrying its own accent and a worked example threaded back to the
//      dialogue's actual kain panjang.
//
// The interjecties section (dong, kok, wah, …) sits as a small particle-lexicon
// after the grammar — they're the staccato breath of the bargaining scene.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 8 --pretty > src/pages/lessons/lesson-8/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
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

// ─── Section: Culture spread — batik craft ─────────────────────────────────
//
// 12 paragraphs in source. We rearrange them into a layered editorial spread:
//
//   p0   → drop-cap lede (16e eeuw, vervolmaakt op Java)
//   p1   → continuation about the canting tool
//   pull-quote pulled out of the prose: "De canting werkt als een vulpen"
//   p2/p3 → rendered as a tulis-vs-cap diptych side by side
//   p4   → small inline note "vakkennis en geduld"
//   p5   → the secret-wax / synthetic-dye paragraph as a regular body line
//   p6   → the schema rendered as the 9-step process flow (the visual gem)
//   p7   → the motif-status hierarchy with parang rusak callout
//   p8/p9 → modern usage + traditional centres as paired closing prose
//   p10  → batikschilderen of Yogyakarta (Bagong Kusudiardjo etc.)
//   p11  → zeefdruk-cap modern combination

const PROCESS_STEPS = [
  { letter: 'a', label: 'prepareren', detail: 'stof voorbereiden' },
  { letter: 'b', label: 'tekenen', detail: 'motief met potlood' },
  { letter: 'c', label: 'afdekken', detail: 'stof met was' },
  { letter: 'd', label: 'eerste bad', detail: 'indompelen in verf' },
  { letter: 'e', label: 'krabben', detail: 'was deels verwijderen' },
  { letter: 'f', label: 'opnieuw was', detail: 'ander deel afdekken' },
  { letter: 'g', label: 'tweede bad', detail: 'indompelen in verf' },
  { letter: 'h', label: 'heetwater', detail: 'was wegspoelen' },
  { letter: 'i', label: 'verkoop', detail: 'naar de markt' },
] as const

const BATIK_CENTRES = ['Ceribon', 'Surakarta', 'Yogyakarta', 'Banyumas', 'Pekalongan', 'Tasikmalaya'] as const

function CultureSpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const p = c.paragraphs
  return (
    <section className={classes.section} aria-labelledby="s-craft">
      <div className={classes.craftBand}>
        <p className={classes.craftKicker}>Cultuur · Het Javaanse handwerk</p>
        <h2 id="s-craft" className={classes.craftDisplay}>
          De canting als vulpen,
          <span className={classes.craftDisplayLine2}>en de stof als bladzijde</span>
        </h2>

        {/* Lede — drop-capped 16th century anchor */}
        <p className={classes.craftLede}>{p[0]}</p>

        {/* Continuation about the canting */}
        <p className={classes.craftBody}>{p[1]}</p>

        {/* Pull-quote — the canting metaphor */}
        <blockquote className={classes.craftPull}>
          <span className={classes.craftPullMark}>&ldquo;</span>
          De canting werkt als een vulpen — een reservoir voor de warme was,
          een tuitje waarmee op de stof wordt &lsquo;geschreven&rsquo;
          <em className={classes.craftPullWord}>tulis</em>.
          <span className={classes.craftPullMarkClose}>&rdquo;</span>
        </blockquote>

        {/* Tulis vs Cap — diptych */}
        <div className={classes.diptych}>
          <article className={classes.diptychPanel} data-side="tulis">
            <span className={classes.diptychKicker}>batik tulis</span>
            <span className={classes.diptychGloss}>Met de hand getekend</span>
            <p className={classes.diptychBody}>{p[2]}</p>
          </article>
          <article className={classes.diptychPanel} data-side="cap">
            <span className={classes.diptychKicker}>batik cap</span>
            <span className={classes.diptychGloss}>Met stempels gedrukt</span>
            <p className={classes.diptychBody}>{p[3]}</p>
          </article>
        </div>

        {/* Quality note */}
        <p className={classes.craftAside}>{p[4]}</p>

        {/* Process body — the geheime samenstelling */}
        <p className={classes.craftBody}>{p[5]}</p>

        {/* The schema — paragraph 6 rendered as a 9-step process flow */}
        <div className={classes.process}>
          <p className={classes.processHeading}>Het batikproces in negen stappen</p>
          <ol className={classes.processGrid}>
            {PROCESS_STEPS.map((step, i) => (
              <li key={step.letter} className={classes.processStep} data-step={step.letter}>
                <span className={classes.processLetter}>{step.letter}</span>
                <span className={classes.processLabel}>{step.label}</span>
                <span className={classes.processDetail}>{step.detail}</span>
                {i < PROCESS_STEPS.length - 1 && <span className={classes.processArrow} aria-hidden="true">→</span>}
              </li>
            ))}
          </ol>
        </div>

        {/* Motif status — extract the parang rusak insight */}
        <div className={classes.motif}>
          <span className={classes.motifKicker}>Het motief draagt de status</span>
          <p className={classes.motifBody}>{p[7]}</p>
          <div className={classes.motifCallout}>
            <span className={classes.motifCalloutKey}>parang rusak</span>
            <span className={classes.motifCalloutGloss}>
              alleen voor de adel aan het hof van Yogyakarta en Surakarta
            </span>
          </div>
        </div>

        {/* Modern usage */}
        <p className={classes.craftBody}>{p[8]}</p>

        {/* Traditional centres — small placename row */}
        <div className={classes.centres}>
          <span className={classes.centresLabel}>Traditionele batikcentra</span>
          <ul className={classes.centresList}>
            {BATIK_CENTRES.map((name) => (
              <li key={name} className={classes.centreChip}>{name}</li>
            ))}
          </ul>
        </div>

        {/* Coda — batikschilderen + modern zeefdruk */}
        <p className={classes.craftCoda}>{p[10]}</p>
        <p className={classes.craftCoda}>{p[11]}</p>
      </div>
    </section>
  )
}

// ─── Section: Dialogue — Sarinah Jaya in three acts ───────────────────────

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

function speakerTone(speaker: string): 'yati' | 'tin' | 'mas' | 'penjual' | 'narrator' {
  const s = speaker.toLowerCase()
  if (s.includes('yati')) return 'yati'
  if (s.includes('tin')) return 'tin'
  if (s.includes('mas') || s.includes('sarto')) return 'mas'
  if (s.includes('penjual')) return 'penjual'
  return 'narrator'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }

  // Split into three acts to give the 20 lines breathing room.
  // Act I = lift to floor 4 (lines 0-5)
  // Act II = searching the kain panjang (lines 6-13)
  // Act III = the choice + payment (lines 14-19)
  const act1 = c.lines.slice(0, 6)
  const act2 = c.lines.slice(6, 14)
  const act3 = c.lines.slice(14)

  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Sarinah Jaya, vierde verdieping</p>
        <h2 id="s-dial" className={classes.sectionTitle}>
          Ibu Yati en Tin zoeken een kain panjang voor oma
        </h2>
        <p className={classes.dialogueSetup}>
          Het Indonesische warenhuis Sarinah Jaya, ongeveer wat V&amp;D ooit was.
          Drie scènes: eerst de zoektocht naar de lift, dan de jacht op de
          juiste batik &mdash; niet te modern, ongeveer Rp 25.000 &mdash; en
          ten slotte het moment waarop moeder en dochter het eens worden.
          Let op het vergelijken: <em>bagus</em>, <em>lebih bagus</em>, <em>paling bagus</em>.
        </p>

        {[
          { title: 'I · De lift', lines: act1 },
          { title: 'II · De keuze', lines: act2 },
          { title: 'III · De prijs', lines: act3 },
        ].map((act) => (
          <div key={act.title} className={classes.dialogueAct}>
            <p className={classes.dialogueActTitle}>{act.title}</p>
            <div className={classes.dialogueLines}>
              {act.lines.map((line, i) => (
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
        ))}
      </div>
    </section>
  )
}

// ─── Section: Comparison ladder (grammar — Trappen van vergelijking) ──────

const LADDER_ACCENTS = ['cyan', 'teal', 'amber', 'orange', 'green', 'purple', 'rose', 'sky', 'green', 'purple'] as const

type GrammarCategory = {
  title: string
  rules: string[]
  examples?: Array<{ indonesian: string; dutch: string }>
}

function ComparisonLadder({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-ladder">
      <p className={classes.ladderEyebrow}>Grammatica · Trappen van vergelijking</p>
      <h2 id="s-ladder" className={classes.sectionTitle}>
        <em>bagus</em> &middot; <em>lebih bagus</em> &middot; <em>paling bagus</em> &mdash; en alles ertussen
      </h2>
      <p className={classes.ladderIntro}>
        De dialoog draait om één vraag: welke kain is <em>het mooiste</em>? Indonesisch
        bouwt die ladder zonder vervoeging — een woordje ervoor, een voorvoegsel,
        soms een verdubbeling. Tien manieren waarop het werkt, allemaal te horen
        in het gesprek hierboven.
      </p>

      <ol className={classes.ladderRungs}>
        {c.categories.map((cat, i) => (
          <li key={i} className={classes.ladderRung} data-accent={LADDER_ACCENTS[i % LADDER_ACCENTS.length]}>
            <header className={classes.ladderRungHeader}>
              <span className={classes.ladderRungNumber}>{String(i + 1).padStart(2, '0')}</span>
              <h3 className={classes.ladderRungTitle}>{cat.title}</h3>
            </header>
            <div className={classes.ladderRungBody}>
              <ul className={classes.ladderRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
              {cat.examples && cat.examples.length > 0 && (
                <div className={classes.ladderExamples}>
                  {cat.examples.map((ex, j) => (
                    <div key={j} className={classes.ladderExample}>
                      <div className={classes.ladderExampleId}>{ex.indonesian}</div>
                      <div className={classes.ladderExampleNl}>{ex.dutch}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── Section: Interjecties — a particle lexicon ──────────────────────────

type ParticleRow = [string, string]
type InterjectionContent = {
  categories: Array<{
    title: string
    rules?: string[]
    table?: ParticleRow[]
    examples?: Array<{ indonesian: string; dutch: string }>
  }>
}

function ParticleLexicon({ section }: { section: typeof sections[number] }) {
  const c = section.content as unknown as InterjectionContent
  const intro = c.categories[0]
  const overview = c.categories[1]
  const table = overview?.table ?? []
  const examples = overview?.examples ?? []
  return (
    <section className={classes.section} aria-labelledby="s-particles">
      <p className={classes.particlesEyebrow}>Spreektaal · Korte tussenwerpsels</p>
      <h2 id="s-particles" className={classes.sectionTitle}>
        De kleine woordjes die alles kleuren — <em>dong, kok, wah, sih</em>
      </h2>
      <p className={classes.particlesIntro}>
        {intro?.rules?.join(' ')}
      </p>

      <div className={classes.particlesGrid}>
        {table.map(([particle, gloss], i) => (
          <article key={particle} className={classes.particleCell} data-cell={(i % 6) + 1}>
            <span className={classes.particleWord}>{particle}</span>
            <span className={classes.particleGloss}>{gloss}</span>
          </article>
        ))}
      </div>

      {examples.length > 0 && (
        <div className={classes.particlesExamples}>
          <p className={classes.particlesExamplesHeading}>In zinnen</p>
          {examples.map((ex, i) => (
            <div key={i} className={classes.particlesExampleRow}>
              <span className={classes.particlesExampleId}>{ex.indonesian}</span>
              <span className={classes.particlesExampleNl}>{ex.dutch}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Section: Vocabulary — dense reference grid ───────────────────────────

type Item = { indonesian: string; dutch: string; audioUrl?: string }

function VocabularyGrid({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · {c.items.length} woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>
        Het lexicon van de markt — stof, kleur, prijs, gebaar
      </h2>
      <p className={classes.vocabHint}>
        Een compacte lijst: alle woorden die nodig zijn voor het haggling-gesprek
        en het culturele opstel. Tik op een woord om het uit te spreken.
      </p>

      <div className={classes.vocabGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.vocabEntry}>
            <PlayButton src={item.audioUrl} />
            <div className={classes.vocabId}>{item.indonesian}</div>
            <div className={classes.vocabNl}>{item.dutch}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Expressions — only 4 items, render as small showcase ───────

function ExpressionsRow({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.expressionsEyebrow}>Uitdrukkingen</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Vaste wendingen uit het gesprek</h2>

      <div className={classes.expressionsGrid}>
        {c.items.map((item, i) => (
          <article key={i} className={classes.expressionCard}>
            <div className={classes.expressionIdRow}>
              <span className={classes.expressionId}>{item.indonesian}</span>
              <PlayButton src={item.audioUrl} />
            </div>
            <span className={classes.expressionNl}>{item.dutch}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson8Page() {
  const activation = useLessonActivation(meta.id)
  // Section index map (DB order):
  //   0: text — culture (batik craft, 12 paragraphs)
  //   1: dialogue (Sarinah Jaya, 20 lines)
  //   2: vocabulary (49 items)
  //   3: expressions (4 items)
  //   4: grammar — interjecties
  //   5: grammar — trappen van vergelijking (10 categories — the lesson's spine)
  //   6: exercises (skipped)
  return (
    <article className={classes.page}>
      {/* Hero band — batik tulis artisan with canting (Trusmi, Cirebon) */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Batik</span>
              <span className={classes.heroTitleNl}>De Javaanse stof, en hoe je zegt welke mooier is</span>
            </h1>
            <p className={classes.heroDescription}>
              Sinds de zestiende eeuw schrijft de canting met warme was op
              katoen — eerst voor de hofkleding van Yogyakarta, vandaag voor
              de kassa van Sarinah Jaya. Ibu Yati zoekt een <em>kain panjang</em>
              voor oma&apos;s 76e verjaardag. Onderweg leren we hoe je in het
              Indonesisch zegt dat <em>deze</em> mooier is dan <em>die</em>.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een batik vergelijken is een taalkundige oefening:
            <em> bagus</em> &middot; <em> lebih bagus</em> &middot; <em> paling bagus</em>.
            Geen vervoegingen, geen Steigerung — alleen een woordje ervoor, en
            de hele markt staat open.
          </p>
          <p className={classes.ledeMeta}>Les 8 · A1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson-level grammar-explanation audio */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <p className={classes.audioLabel}>Uitleg bij de grammatica · audio</p>
            <LessonAudioPlayer src={meta.lesson_audio_url} />
          </div>
        </section>
      )}

      {/* Main content — craft first, then the dialogue it produces, then the
          grammar that the dialogue's haggling actually uses, then particles,
          then the reference lists. */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <CultureSpread     section={sections[0]} />
          <DialogueScene     section={sections[1]} />
          <ComparisonLadder  section={sections[5]} />
          <ParticleLexicon   section={sections[4]} />
          <VocabularyGrid    section={sections[2]} />
          <ExpressionsRow    section={sections[3]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de batikwoorden, de trappen van vergelijking
            en de korte tussenwerpsels komen vanzelf in je oefensessies langs.
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
