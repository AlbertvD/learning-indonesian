// Lesson 30 — Bab 14 · Musik Pop di Indonesia (Indonesische popmuziek) — bespoke reader page.
//
// Mood: a cassette sleeve under stage light. The reading essay opens like a
// liner-note; the two keroncong songs are set as lyric stanzas on a "tape side
// A / side B" spread; the seven neologism word-formation devices read as a
// type-foundry of borrowed prefixes; the love-words and love-lines glow warm.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 30 --pretty > src/pages/lessons/lesson-30/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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
// 7 categories. [0] = "how new words emerge" (framing overview, no examples).
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

      {/* Framing overview — the standardisation note */}
      <div className={classes.foundryIntro}>
        <span className={classes.foundryGlyph}>kata&#8202;baru</span>
        <ul className={classes.foundryRules}>
          {overview.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
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

// ─── Page composition ────────────────────────────────────────────────────────

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

export default function Lesson30Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — full-bleed, stage-light over a wall of cassettes */}
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

      {/* Lesson audio — guarded band (lights up when audio is attached) */}
      <LessonGrammarAudioBand
        nl={meta.lesson_audio_url}
        en={meta.lesson_audio_url_en}
        voice={meta.primary_voice ?? undefined}
        bandClassName={classes.audioBand}
        innerClassName={classes.audioInner}
      />

      {/* Main content */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <ReadingAndSongs section={sections[0]} />
          <Lexicon
            section={sections[1]}
            eyebrow="Woordenschat · Muziek & opname"
            title="Van kaset tot bengawan"
            tone="tape"
            id="s-vocab"
          />
          <GrammarFoundry section={sections[2]} />
          <Lexicon
            section={sections[3]}
            eyebrow="Woordenschat · Woorden over liefde"
            title="Cinta, pacar, kekasih — het lexicon van het hart"
            tone="love"
            id="s-love"
          />
          <Expressions section={sections[4]} />
          <Exercises section={sections[5]} />
        </main>
      </section>

      {/* Closing band */}
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
    </article>
  )
}
