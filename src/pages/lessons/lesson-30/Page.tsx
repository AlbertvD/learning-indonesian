// Lesson 30 — Bab 14 · Musik Pop di Indonesia (Indonesische popmuziek) — bespoke
// reader page (chapter-experience conversion).
//
// Mood: a cassette sleeve under stage light. The reading essay opens like a
// liner-note; the two keroncong songs are set as lyric stanzas on a "tape side
// A / side B" spread; the seven neologism word-formation devices read as a
// type-foundry of borrowed prefixes; the love-words and love-lines glow warm.
//
// Chapters: the cover ("Inhoud" — hero + lede + overview), then Lezen (the
// liner-note essay + the two keroncong songs) → Woorden (music & recording
// vocabulary) → Grammatica (the neologism foundry, with the les-audio) → Cinta
// (an editorial merge of the love-vocabulary lexicon and the love-line
// standaardzinnen — same move as lesson-5's Tussendoor and lesson-27's Brief:
// two short, thematically-linked sections that already flowed back-to-back
// and share the same warm/rose visual identity) → Latihan (the seven written
// exercises as reference, matching lesson-27's precedent) → the closing
// Oefenen chapter.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 30 --pretty > src/pages/lessons/lesson-30/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { ChapterExperience, type LessonChapter } from '@/components/lessons/ChapterExperience'
import { LessonChapterOverview } from '@/components/lessons/LessonChapterOverview'
import content from './content.json'
import classes from './Page.module.css'

const meta = content.meta
const sections = content.sections

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarExample = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: GrammarExample[] }

// ─── Inline play button ──────────────────────────────────────────────────────

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

// ─── Reading essay + the two keroncong songs ─────────────────────────────────
//
// paragraphs[0..3] = the liner-note essay; paragraphs[4..5] = two song lyrics,
// each "TITLE\n\nstanza\n\nstanza". We split the essay from the songs and set
// the songs as a "Side A / Side B" lyric spread.

function ReadingAndSongs({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const essay = c.paragraphs.slice(0, 4)
  const songs = c.paragraphs.slice(4).map((raw) => {
    const [title, ...rest] = raw.split('\n\n')
    return { title: title.trim(), stanzas: rest.map((s) => s.split('\n').filter(Boolean)) }
  })
  const sideLabels = ['Kant A', 'Kant B']
  return (
    <section className={classes.section} aria-labelledby="s-read">
      <p className={classes.readEyebrow}>Leestekst · Kaset & keroncong</p>
      <h2 id="s-read" className={classes.sectionTitle}>De pop draait niet op cd, maar op cassette</h2>

      <div className={classes.readBand}>
        {essay.map((para, i) => (
          <p key={i} className={classes.readPara} data-lead={i === 0 ? 'true' : undefined}>
            {para}
          </p>
        ))}
      </div>

      {/* Two pop-klassiek keroncong songs as liner-note lyric cards */}
      <div className={classes.songSpread}>
        {songs.map((song, i) => (
          <article key={i} className={classes.songCard} data-side={i % 2 === 0 ? 'a' : 'b'}>
            <header className={classes.songHeader}>
              <span className={classes.songSide}>{sideLabels[i] ?? `Lagu ${i + 1}`}</span>
              <h3 className={classes.songTitle}>{song.title}</h3>
            </header>
            <div className={classes.songStanzas}>
              {song.stanzas.map((stanza, j) => (
                <div key={j} className={classes.stanza}>
                  {stanza.map((line, k) => (
                    <p key={k} className={classes.lyricLine}>{line}</p>
                  ))}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Vocabulary lexicons ─────────────────────────────────────────────────────

function Lexicon({
  section, eyebrow, title, tone, id,
}: {
  section: typeof sections[number]
  eyebrow: string
  title: string
  tone: 'tape' | 'love'
  id: string
}) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby={id}>
      <p className={tone === 'love' ? classes.loveEyebrow : classes.vocabEyebrow}>{eyebrow}</p>
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

// ─── Expressions — love lines, stacked and warm ──────────────────────────────

function Expressions({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.exprEyebrow}>Standaardzinnen · Cinta</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Wat je zegt als de melodie je meeneemt</h2>
      <div className={classes.exprGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.exprChip}>
            <div className={classes.exprIdRow}>
              <PlayButton src={item.audioUrl} />
              <span className={classes.exprId}>{item.indonesian}</span>
            </div>
            <span className={classes.exprNl}>{item.dutch}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Grammar — the neologism foundry ─────────────────────────────────────────
//
// 7 categories. [0] = "how new words emerge" (framing overview — its title AND
// its single institutional-name example must render, not just its rules; a
// sibling lesson's chapter conversion silently dropped an overview category's
// title/examples, so this is rendered explicitly and content-parity-tested).
// [1] = Bina/Graha/Loka, [2] PRA-, [3] PRAMU-, [4] TUNA-, [5] -WAN — the five
// productive word-formation devices, rendered as accent-coded foundry tiles.
// [6] = register & wordplay (plesetan → swear words), a recognise-only band set
// apart with a neutral, "passive register" treatment.

const DEVICE_ACCENTS = ['cyan', 'amber', 'purple', 'teal', 'orange'] as const

// Each device tile leads with the affix glyph pulled from its title (e.g. "PRA-").
function affixGlyph(title: string): string {
  const m = title.match(/^([A-Za-z-]+(?:-)?)/)
  if (!m) return ''
  const raw = m[1].toLowerCase()
  return raw
}

function GrammarFoundry({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const overview = c.categories[0]
  const devices = c.categories.slice(1, 6)
  const register = c.categories[6]
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · Hoe nieuwe woorden ontstaan</p>
      <h2 id="s-gram" className={classes.sectionTitle}>Geleende voor- en achtervoegsels</h2>

      {/* Framing overview — the standardisation note, with its own title and
          the one institutional-name example rendered alongside the rules. */}
      <div className={classes.foundryIntro}>
        <span className={classes.foundryGlyph}>kata&#8202;baru</span>
        <div className={classes.foundryIntroBody}>
          <h3 className={classes.foundryIntroTitle}>{overview.title}</h3>
          <ul className={classes.foundryRules}>
            {overview.rules.map((r, j) => <li key={j}>{r}</li>)}
          </ul>
          {overview.examples.length > 0 && (
            <div className={classes.foundryIntroExamples}>
              {overview.examples.map((ex, j) => (
                <div key={j} className={classes.foundryIntroExample}>
                  <span className={classes.foundryIntroExampleId}>
                    {ex.indonesian}
                    <PlayButton src={ex.audioUrl} />
                  </span>
                  <span className={classes.foundryIntroExampleNl}>{ex.dutch}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={classes.deviceGrid}>
        {devices.map((dev, i) => (
          <article key={i} className={classes.deviceTile} data-accent={DEVICE_ACCENTS[i % DEVICE_ACCENTS.length]}>
            <header className={classes.deviceHeader}>
              <span className={classes.deviceAffix}>{affixGlyph(dev.title)}</span>
              <h3 className={classes.deviceTitle}>{dev.title}</h3>
            </header>
            <ul className={classes.deviceRules}>
              {dev.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {dev.examples.length > 0 && (
              <div className={classes.examplePairs}>
                {dev.examples.map((ex, j) => {
                  const [left, right] = ex.indonesian.includes('→')
                    ? ex.indonesian.split('→').map((s) => s.trim())
                    : [ex.indonesian, '']
                  return (
                    <div key={j} className={classes.examplePair}>
                      {right ? (
                        <>
                          <span className={classes.exLeft}>{left}</span>
                          <span className={classes.exArrow}>→</span>
                          <span className={classes.exRight}>
                            {right}
                            <PlayButton src={ex.audioUrl} />
                          </span>
                        </>
                      ) : (
                        <span className={classes.exRight} style={{ gridColumn: '1 / -1' }}>
                          {left}
                          <PlayButton src={ex.audioUrl} />
                        </span>
                      )}
                      <span className={classes.exNl}>{ex.dutch}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Register & wordplay — recognise-only, neutral framing */}
      {register && (
        <article className={classes.registerBand}>
          <header className={classes.registerHeader}>
            <span className={classes.registerTag}>Passief register</span>
            <h3 className={classes.registerTitle}>{register.title}</h3>
          </header>
          <ul className={classes.registerRules}>
            {register.rules.map((r, j) => <li key={j}>{r}</li>)}
          </ul>
          {register.examples.length > 0 && (
            <div className={classes.plesetanRow}>
              {register.examples.map((ex, j) => (
                <div key={j} className={classes.plesetanChip}>
                  <div className={classes.plesetanId}>
                    {ex.indonesian}
                    <PlayButton src={ex.audioUrl} />
                  </div>
                  <div className={classes.plesetanNl}>{ex.dutch}</div>
                </div>
              ))}
            </div>
          )}
        </article>
      )}
    </section>
  )
}

// ─── Exercises — the Latihan, as a study reference ───────────────────────────

function Exercises({ section }: { section: typeof sections[number] }) {
  const c = section.content as {
    sections: { title: string; instruction: string; items: { prompt: string; answer?: string }[] }[]
  }
  return (
    <section className={classes.section} aria-labelledby="s-exercises">
      <p className={classes.grammarEyebrow}>Oefeningen · Latihan</p>
      <h2 id="s-exercises" className={classes.sectionTitle}>Oefeningen</h2>
      <div className={classes.exerciseList}>
        {c.sections.map((blk, i) => (
          <article key={i} className={classes.exerciseBlock}>
            <h3 className={classes.exerciseBlockTitle}>{blk.title}</h3>
            <p className={classes.exerciseInstruction}>{blk.instruction}</p>
            {blk.items.length > 0 && (
              <ol className={classes.exerciseItems}>
                {blk.items.map((it, j) => (
                  <li key={j} className={classes.exerciseItem}>
                    <span className={classes.exercisePrompt}>{it.prompt}</span>
                    {it.answer && <span className={classes.exerciseAnswer}>{it.answer}</span>}
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </div>
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
    /* Hero — full-bleed, stage-light over a wall of cassettes. Rendered ABOVE
       the chapter nav via ChapterExperience's hero slot (cover only): the nav
       sits under the hero and pins to the top on scroll. */
    <header className={classes.heroBand}>
      <div className={classes.heroInner}>
        <div className={classes.heroLeft}>
          <div className={classes.heroBadgeRow}>
            <span className={classes.heroBadge}>{meta.level}</span>
            <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
          </div>
          <h1 className={classes.heroTitle}>
            <span className={classes.heroTitleId}>Musik Pop di Indonesia</span>
            <span className={classes.heroTitleNl}>Indonesische popmuziek</span>
          </h1>
          <p className={classes.heroDescription}>
            Pop in Indonesië klinkt in het Indonesisch, niet in het Engels — en je koopt hem op
            cassette, niet op cd. Tussen de nieuwe hits door draaien twee keroncong-klassiekers:
            Bengawan Solo en Terang Bulan. En in de taal zelf worden, woord voor woord, nieuwe
            begrippen gesmeed.
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
            Een cassette ruikt naar de plek waar je hem kocht. Speel hem jaren later af en{' '}
            <em>bau dan gambar Indonesia</em> komen terug — geur en beeld in één. Dit hoofdstuk gaat
            over die muziek, over woorden van liefde, en over hoe een taal nieuwe woorden bouwt.
          </p>
          <p className={classes.ledeMeta}>Les 30 · {meta.level} · Bahasa Indonesia</p>
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
          Activeer de les en de woorden, standaardzinnen en woordvormings­patronen verschijnen
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
//   0 = text (liner-note essay + two keroncong songs)
//   1 = vocabulary (40 items — music & recording)
//   2 = grammar (7 neologism-foundry categories)
//   3 = vocabulary (26 items — love)
//   4 = expressions (9 love lines)
//   5 = exercises (7 Latihan blocks — rendered as reference)
//
// Exported for the content-parity test: with the one-chapter-at-a-time mount
// strategy the live DOM only holds the current chapter, so the test renders
// every chapter node from this list and checks content.json coverage.

// eslint-disable-next-line react-refresh/only-export-components -- test-only export (content-parity guard renders each chapter node)
export function buildChapters(activation: ReturnType<typeof useLessonActivation>): LessonChapter[] {
  return [
    // Cover convention: titled "Inhoud" — it IS the contents page (hero +
    // lede + the chapter overview), not a story (matches lesson 5 / 21 / 27).
    { id: 'inhoud',     title: 'Inhoud',     node: <InhoudChapter /> },
    { id: 'lezen',      title: 'Lezen',      description: 'De popindustrie draait op cassette, niet op cd — met de twee keroncong-klassiekers Bengawan Solo en Terang Bulan als lyrische inzet.',
      node: <Shell><ReadingAndSongs section={sections[0]} /></Shell> },
    { id: 'woorden',    title: 'Woorden',    description: '40 woorden over muziek, cassettes en opnames — van kaset tot bengawan.',
      node: <Shell><Lexicon section={sections[1]} eyebrow="Woordenschat · Muziek & opname" title="Van kaset tot bengawan" tone="tape" id="s-vocab" /></Shell> },
    { id: 'grammatica', title: 'Grammatica', description: 'Zeven manieren waarop het Indonesisch nieuwe woorden leent en smeedt, van bina/graha/loka tot -wan — met de les-audio.',
      node: (
        <>
          {/* The grammar podcast audio lives WITH the grammar (matches
              lesson 5 / 21 / 27 — never orphaned on the cover). */}
          <LessonGrammarAudioBand
            nl={meta.lesson_audio_url}
            en={meta.lesson_audio_url_en}
            voice={meta.primary_voice ?? undefined}
            bandClassName={classes.audioBand}
            innerClassName={classes.audioInner}
          />
          <Shell><GrammarFoundry section={sections[2]} /></Shell>
        </>
      ) },
    { id: 'cinta',      title: 'Cinta',      description: 'De woorden en standaardzinnen van het hart: van cinta en pacar tot "Aku cinta padamu".',
      node: (
        <Shell>
          <Lexicon section={sections[3]} eyebrow="Woordenschat · Woorden over liefde" title="Cinta, pacar, kekasih — het lexicon van het hart" tone="love" id="s-love" />
          <Expressions section={sections[4]} />
        </Shell>
      ) },
    { id: 'latihan',    title: 'Latihan',    description: 'De zeven oefeningen uit het lesboek als naslag: van vrij schrijven tot vertalen.',
      node: <Shell><Exercises section={sections[5]} /></Shell> },
    { id: 'oefenen',    title: 'Oefenen',    description: 'Activeer de les en oefen de woorden, standaardzinnen en woordvormingspatronen.',
      node: <OefenenChapter activation={activation} /> },
  ]
}

export default function Lesson30Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      <ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />
    </article>
  )
}
