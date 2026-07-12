// Lesson 1 — Di Pasar (Op de markt) — bespoke reader page, chapter conversion.
//
// The lesson opens the whole course: how Indonesian sounds and is spelled
// (with the full alphabet as a reference), a first taste of grammar (no verb
// conjugation, no articles, the adjective after the noun), building-block
// sentences, the market dialogue that puts them to work, and two reference
// blocks (market vocabulary + expressions, numbers 0-10).
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 1 --pretty > src/pages/lessons/lesson-1/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

type Greeting = { dutch: string; indonesian: string; phonetic?: string; audioUrl?: string }
type Spelling = { rule: string; dutch: string; example: string }
type Sentence = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: Array<{ dutch: string; indonesian: string; audioUrl?: string }> }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }
type Item = { dutch: string; indonesian: string; audioUrl?: string; register?: 'informal'; registerCounterpart?: string }
type Letter = { letter: string; rule: string; examples: string[] }

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

// ─── Section: Pronunciation showcase ───────────────────────────────────────

function PronunciationShowcase({ section }: { section: typeof sections[number] }) {
  const c = section.content as { intro: string; examples: Greeting[]; spelling: Spelling[] }
  return (
    <section className={classes.section} aria-labelledby="s-pron">
      <div className={classes.pronunciationBand}>
        <p className={classes.pronunciationEyebrow}>Klanken &amp; Spelling</p>
        <h2 id="s-pron" className={classes.sectionTitle}>Hoe Indonesisch klinkt</h2>
        <p className={classes.sectionLede}>{c.intro}</p>

        <div className={classes.greetingsList}>
          {c.examples.map((g, i) => (
            <div key={i} className={classes.greetingRow}>
              <div className={classes.greetingId}>
                {g.indonesian}
                <PlayButton src={g.audioUrl} />
              </div>
              <div className={classes.greetingPhonetic}>{g.phonetic}</div>
              <div className={classes.greetingNl}>{g.dutch}</div>
            </div>
          ))}
        </div>

        <p className={classes.spellingHeading}>Anders dan in het Nederlands</p>
        <div className={classes.spellingGrid}>
          {c.spelling.map((s, i) => (
            <div key={i} className={classes.spellingChip}>
              <div className={classes.spellingRule}>{s.rule}</div>
              <div className={classes.spellingExample}>{s.example}</div>
              <div className={classes.spellingMeaning}>{s.dutch}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section: Simple sentences ─────────────────────────────────────────────

function SimpleSentences({ section }: { section: typeof sections[number] }) {
  const c = section.content as { intro?: string; sentences: Sentence[] }
  return (
    <section className={classes.section} aria-labelledby="s-sent">
      <p className={classes.sentencesEyebrow}>Eerste zinnen</p>
      <h2 id="s-sent" className={classes.sectionTitle}>Een zin in vier woorden</h2>
      {c.intro && <p className={classes.sectionLede}>{c.intro}</p>}

      <div className={classes.sentencesList}>
        {c.sentences.map((s, i) => (
          <div key={i} className={classes.sentenceRow}>
            <div className={classes.sentenceId}>
              {s.indonesian}
              <PlayButton src={s.audioUrl} />
            </div>
            <div className={classes.sentenceNl}>{s.dutch}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Grammar (three accent-coded tiles) ───────────────────────────

const GRAMMAR_ACCENTS = ['cyan', 'purple', 'teal'] as const

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { intro: string; categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Drie regels, drie kleuren</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Een handvol grammatica</h2>

      <div className={classes.grammarRules}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.grammarTile} data-accent={GRAMMAR_ACCENTS[i % GRAMMAR_ACCENTS.length]}>
            <header className={classes.grammarTileHeader}>
              <span className={classes.grammarTileNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.grammarTileTitle}>{cat.title}</h3>
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
                        {ex.indonesian}
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
    </section>
  )
}

// ─── Section: Dialogue ─────────────────────────────────────────────────────

function speakerTone(speaker: string): 'ibu' | 'penjual' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('ibu')) return 'ibu'
  if (s.includes('penjual') || s.includes('pak') || s.includes('bapak')) return 'penjual'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { setup?: string; lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Op de markt</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Di Pasar</h2>

        {c.setup && <p className={classes.dialogueSetup}>{c.setup}</p>}

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

// ─── Section: Item list (vocabulary, expressions) ──────────────────────────

function ItemList({
  section,
  eyebrowClass,
  eyebrow,
  title,
  tone,
}: {
  section: typeof sections[number]
  eyebrowClass: string
  eyebrow: string
  title: string
  tone: 'lush' | 'warm'
}) {
  const c = section.content as { items: Item[] }
  const id = `s-${tone}`
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={eyebrowClass}>{eyebrow}</p>
      <h2 id={id} className={classes.sectionTitle}>{title}</h2>

      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip} data-tone={tone}>
            <PlayButton src={item.audioUrl} />
            <span className={classes.itemId}>{item.indonesian}</span>
            {item.register === 'informal' && <span className={classes.spreektaalTag}>spreektaal</span>}
            <span className={classes.itemSep} />
            <span className={classes.itemNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Numbers ──────────────────────────────────────────────────────

function NumbersGrid({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-num">
      <p className={classes.numbersEyebrow}>Getallen 0–10</p>
      <h2 id="s-num" className={classes.sectionTitle}>Nol tot sepuluh</h2>

      <div className={classes.numbersRail}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.numberBlock}>
            <span className={classes.numberId}>
              {item.indonesian}
              <PlayButton src={item.audioUrl} />
            </span>
            <span className={classes.numberNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Alphabet ─────────────────────────────────────────────────────

function AlphabetGuide({ section }: { section: typeof sections[number] }) {
  const c = section.content as { letters: Letter[] }
  return (
    <section className={classes.section} aria-labelledby="s-alpha">
      <p className={classes.alphabetEyebrow}>Het Indonesische alfabet</p>
      <h2 id="s-alpha" className={classes.sectionTitle}>Letter voor letter</h2>

      <div className={classes.alphabetGrid}>
        {c.letters.map((l, i) => (
          <div key={i} className={classes.alphabetCell}>
            <div className={classes.alphabetHead}>
              <span className={classes.alphabetLetter}>{l.letter}</span>
              <span className={classes.alphabetRule}>{l.rule}</span>
            </div>
            <div className={classes.alphabetExamples}>
              {l.examples.map((ex, j) => <span key={j} className={classes.alphabetExample}>{ex}</span>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Chapter wrappers ───────────────────────────────────────────────────────
// Each content chapter re-wraps one or more of the scenes above in the shell
// band the old single scroll page shared. Same components, same CSS —
// re-grouped, not rewritten (docs/plans/2026-07-06-lesson-chapter-experience-program.md).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className={classes.shellBand}>
      <main className={classes.shell}>{children}</main>
    </section>
  )
}

function Hero() {
  return (
    /* Hero — full-bleed, decorated (teal→navy→amber). Rendered ABOVE the
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
            <span className={classes.heroTitleId}>Di Pasar</span>
            <span className={classes.heroTitleNl}>Op de markt</span>
          </h1>
          <p className={classes.heroDescription}>
            Ibu wil naar de markt. Ze wil bananen kopen. Een eerste kennismaking met het Indonesisch — de klanken, een handvol grammatica, getallen tot tien, en een gesprek met de verkoper.
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
            Indonesisch leest <em>zoals het klinkt</em>. Geen vervoegingen, geen lidwoorden, weinig dingen die je in andere talen kent. Wel een eigen ritme — en een eigen warmte aan de marktkraam.
          </p>
          <p className={classes.ledeMeta}>Les 1 · Beginner · Bahasa Indonesia</p>
        </div>
      </section>

      {/* "In deze les" — the chapter overview that makes the opening a real
          lesson start instead of head-matter. NOT wrapped in Shell: the
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
//   0 = text (pronunciation showcase: greetings + spelling-difference chips)
//   1 = text (simple building-block sentences)
//   2 = grammar (3 categories: werkwoord, zelfstandig naamwoord, bijvoeglijk naamwoord)
//   3 = dialogue (Ibu haggling with the Penjual over bananas)
//   4 = vocabulary
//   5 = expressions
//   6 = numbers (0-10)
//   7 = pronunciation (full alphabet, letter by letter)
//   8 = exercises (skipped — practice surface)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story.
    { id: 'inhoud',     title: 'Inhoud',     node: <InhoudChapter /> },
    { id: 'klanken',    title: 'Klanken',    description: 'Hoe Indonesisch klinkt, de belangrijkste spellingsverschillen en het hele alfabet, letter voor letter.',
      node: (
        <Shell>
          <PronunciationShowcase section={sections[0]} />
          <AlphabetGuide section={sections[7]} />
        </Shell>
      ) },
    { id: 'grammatica', title: 'Grammatica', description: 'Drie basisregels — werkwoord, zelfstandig naamwoord, bijvoeglijk naamwoord — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar, not the cover. */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarSection section={sections[2]} /></Shell>
        </>
      ) },
    { id: 'zinnen',     title: 'Zinnen',     description: 'Een handvol eenvoudige zinnen om de basisstructuur van het Indonesisch te oefenen.',
      node: <Shell><SimpleSentences section={sections[1]} /></Shell> },
    { id: 'dialoog',    title: 'Dialoog',    description: 'Ibu onderhandelt met de verkoper over de prijs van bananen.',
      node: <Shell><DialogueScene section={sections[3]} /></Shell> },
    { id: 'woorden',    title: 'Woorden',    description: 'Woordenschat van de markt en een handvol vaste uitdrukkingen.',
      node: (
        <Shell>
          <ItemList
            section={sections[4]}
            eyebrowClass={classes.vocabEyebrow}
            eyebrow="Woordenschat"
            title="Woorden van de markt"
            tone="lush"
          />
          <ItemList
            section={sections[5]}
            eyebrowClass={classes.expressionsEyebrow}
            eyebrow="Uitdrukkingen"
            title="Korte vragen en antwoorden"
            tone="warm"
          />
        </Shell>
      ) },
    { id: 'getallen',   title: 'Getallen',   description: 'De getallen 0 tot en met 10, met audio bij elk woord.',
      node: <Shell><NumbersGrid section={sections[6]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden en patronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson1Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
