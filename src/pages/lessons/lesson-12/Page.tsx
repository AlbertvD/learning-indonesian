// Lesson 12 — Di Stasiun Gambir di Jakarta (Op station Gambir in Jakarta) — bespoke reader page.
//
// A station lesson, and a lesson about waiting. The whole dialogue runs on the
// clock — 14.30, 15.06, 19.00, 19.35 — and on one word: terlambat, te laat.
// Ibu stands on the perron in the dusk light watching for the Senja Utama and
// her daughter's train from Yogya. The page is built around the timetable: an
// amber departure-board accent over an indigo-at-dusk hero, the dialogue staged
// as a platform reunion, the grammar read from its acronym / direction tables,
// and a closing economics spread on the country those rails were meant to build.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 12 --pretty > src/pages/lessons/lesson-12/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
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

// ─── 1. Dialogue — the platform reunion ────────────────────────────────────

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

function speakerTone(speaker: string): 'ibu' | 'pak' | 'jumilah' | 'narrator' {
  const s = speaker.toLowerCase()
  if (s.includes('narrator')) return 'narrator'
  if (s.includes('jumilah') || s.includes('jum')) return 'jumilah'
  if (s.includes('pak')) return 'pak'
  return 'ibu'
}

const SPEAKER_LABEL: Record<string, string> = {
  narrator: 'Verteller',
  ibu: 'Ibu',
  pak: 'Penjaga',
  jumilah: 'Jumilah',
}

function PlatformScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dialogue">
      <div className={classes.sceneBand}>
        <p className={classes.sceneEyebrow}>Dialoog · Op het perron</p>
        <h2 id="s-dialogue" className={classes.sectionTitle}>Di Stasiun Gambir</h2>
        <p className={classes.sceneSetup}>
          Ibu staat al sinds kwart voor twee op het perron. De trein uit Yogya — met haar dochter
          Jumilah, studente in Gadjah Mada — had om 14.30 moeten aankomen, maar het is al voorbij
          drieën. <em>Selalu terlambat.</em> Altijd te laat. Tot de trein eindelijk binnenrijdt en
          moeder en dochter elkaar terugzien.
        </p>

        <div className={classes.dialogueLines}>
          {c.lines.map((line, i) => {
            const tone = speakerTone(line.speaker)
            if (tone === 'narrator') {
              return (
                <div key={i} className={classes.narratorLine}>
                  <span className={classes.narratorId}>{line.text}</span>
                  <PlayButton src={line.audioUrl} />
                  <span className={classes.narratorNl}>{line.translation}</span>
                </div>
              )
            }
            return (
              <div key={i} className={classes.dialogueLine} data-speaker-tone={tone}>
                <div className={classes.dialogueSpeaker}>{SPEAKER_LABEL[tone]}</div>
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

// ─── 2. Vocabulary — lexicon of the rails ──────────────────────────────────

type Item = { dutch: string; indonesian: string; audioUrl?: string }

function Lexicon({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De woorden van het spoor</h2>
      <p className={classes.vocabIntro}>
        Van <em>kereta api</em> en <em>peron</em> tot <em>karcis</em> en <em>terlambat</em> — de taal
        van het station, plus de bouwstenen van de grammatica die volgt. {c.items.length} woorden,
        alfabetisch geordend.
      </p>

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

// ─── 3. Expressions — fixed phrases from the platform ──────────────────────

function Expressions({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.exprEyebrow}>Uitdrukkingen · Vaste verbindingen</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Op tijd, hoofdzaak, en de Senja Utama</h2>

      <div className={classes.exprGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.exprChip}>
            <div className={classes.exprTop}>
              <span className={classes.exprId}>{item.indonesian}</span>
              <PlayButton src={item.audioUrl} />
            </div>
            <span className={classes.exprNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── 4. Grammar — prose rules + reference tables ───────────────────────────

type GrammarCategory = {
  title: string
  rules?: string[]
  table?: string[][]
  examples?: Array<{ dutch: string; indonesian: string }>
}

function GrammarSection({
  section,
  eyebrow,
  title,
  accent,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  accent: 'purple' | 'cyan' | 'teal' | 'amber'
}) {
  const c = section.content as { categories: GrammarCategory[] }
  const id = `s-gram-${title.replace(/\W+/g, '')}`
  return (
    <section className={classes.section} data-accent={accent} aria-labelledby={id}>
      <p className={classes.grammarEyebrow}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>

      <div className={classes.grammarStack}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.grammarBlock}>
            <header className={classes.grammarHead}>
              <span className={classes.grammarNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.grammarBlockTitle}>{cat.title}</h3>
            </header>

            {cat.rules && cat.rules.length > 0 && (
              <ul className={classes.grammarRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>
            )}

            {cat.examples && cat.examples.length > 0 && (
              <div className={classes.grammarExamples}>
                {cat.examples.map((ex, j) => (
                  <div key={j} className={classes.grammarExample}>
                    <span className={classes.grammarExampleId}>{ex.indonesian}</span>
                    <span className={classes.grammarExampleNl}>{ex.dutch}</span>
                  </div>
                ))}
              </div>
            )}

            {cat.table && cat.table.length > 1 && (
              <div className={classes.gtableWrap}>
                <table className={classes.gtable}>
                  <thead>
                    <tr>{cat.table[0].map((h, j) => <th key={j}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {cat.table.slice(1).map((row, r) => (
                      <tr key={r}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── 5. Culture — the economics spread ─────────────────────────────────────

function EconomySpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  // Some paragraphs lead with a bold sub-heading on their own line ("Protectionisme\n…").
  // Split those into a kicker + body so the long read gets internal structure.
  const blocks = c.paragraphs.map((p) => {
    const nl = p.indexOf('\n')
    if (nl > 0 && nl < 40) {
      return { head: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() }
    }
    return { head: null as string | null, body: p }
  })
  return (
    <section className={classes.section} aria-labelledby="s-econ">
      <div className={classes.econBand}>
        <p className={classes.econEyebrow}>Cultuur · Ekonomi</p>
        <h2 id="s-econ" className={classes.econTitle}>De economie van Indonesië</h2>
        <p className={classes.econKicker}>
          De spoorlijn waar Ibu op wacht is meer dan een verbinding tussen Jakarta en Yogya — ze is
          een draad in een land dat zich met olie, industrie en <em>diversifikasi</em> opnieuw probeerde
          uit te vinden. Een langere lezing over de Indonesische economie van de oliecrisis tot de
          deregulering van de jaren negentig.
        </p>
        <div className={classes.econProse}>
          {blocks.map((b, i) => (
            <div key={i} className={classes.econPara}>
              {b.head && <h3 className={classes.econSubhead}>{b.head}</h3>}
              <p>{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson12Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — the platform at Gambir, indigo at dusk */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Di Stasiun Gambir di Jakarta</span>
              <span className={classes.heroTitleNl}>Op station Gambir in Jakarta</span>
            </h1>
            <p className={classes.heroDescription}>
              Een moeder wacht op het perron. De trein uit Yogya is te laat — alweer — en het is al
              voorbij drieën. Een les over kloktijden, wachten en te laat komen, met de woorden van
              het spoor en de acroniemen waarmee Indonesië zijn kaart benoemt.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een station is een les in tijd: <em>jam berapa</em>, <em>pada waktunya</em>,{' '}
            <em>terlambat</em>. Wie leert wachten op een Indonesische trein, leert vanzelf de klok
            lezen, de schemering benoemen, en geduld hebben met een land dat groot is en treinen die
            soms te laat komen.
          </p>
          <p className={classes.ledeMeta}>Les 12 · A1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson-level grammar-explanation audio — band wired in; appears once
          audio is uploaded and meta.lesson_audio_url is set */}
      <LessonGrammarAudioBand
        nl={meta.lesson_audio_url}
        en={meta.lesson_audio_url_en}
        label="Uitleg bij de grammatica · audio"
        bandClassName={classes.audioBand}
        innerClassName={classes.audioInner}
        labelClassName={classes.audioLabel}
      />

      {/* Main content */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <PlatformScene section={sections[0]} />
          <Expressions section={sections[2]} />
          <GrammarSection
            section={sections[3]}
            eyebrow="Grammatica · Acroniemen & afkortingen"
            title="Hoe Indonesië zijn kaart benoemt"
            accent="purple"
          />
          <GrammarSection
            section={sections[4]}
            eyebrow="Grammatica · BER- + verdubbeling"
            title="Elkaar, telkens, met z'n tweetjes"
            accent="cyan"
          />
          <Lexicon section={sections[1]} />
          <EconomySpread section={sections[6]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woorden, zinnen en patronen verschijnen automatisch in je oefensessies.
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
