// Lesson 6 — Jakarta — bespoke reader page.
//
// Lesson 6 is the most grammar-heavy in the curriculum: eight grammar sections
// stacked together would read as a wall. We group them into THREE MOVEMENTS:
//
//   Movement I  · Vier manieren om nee te zeggen  (belum / bukan / tidak / jangan)
//   Movement II · Twee kleine achtervoegsels      (-lah / -kah)
//   Movement III · De Indonesische klok           (dagdelen + kloktijd)
//
// The four negation words are rendered as a unified 2×2 grid — that they ALL
// exist is the lesson. The two suffixes sit side-by-side as a polite/emphatic
// pair. The time material gets a day-strip with band colours that shift from
// dawn to night, then a separate clock-words sub-band.
//
// The 14-paragraph Batavia history opens the page as an editorial timeline,
// with marginal year anchors pulling key dates out of the prose.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 6 --pretty > src/pages/lessons/lesson-6/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import content from './content.json'
import classes from './Page.module.css'

type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples?: Example[]; table?: string[][] }
type Item = { dutch: string; indonesian: string; audioUrl?: string }

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

// ─── History timeline — section 0 (14 paragraphs about Batavia) ────────────
//
// Year anchors are pulled from the prose by inspection (the dataset doesn't
// emit them as a separate field). We attach them to the matching paragraph.

const HISTORY_ANCHORS: Record<number, { year: string; label: string }> = {
  0: { year: '1522', label: 'Sunda Kelapa' },
  1: { year: '1527', label: 'Jayakarta' },
  2: { year: '1610', label: 'VOC' },
  3: { year: '1618', label: 'Hoofdzetel' },
  4: { year: '1619', label: 'Batavia' },
  7: { year: '17e eeuw', label: 'Sultan Agung' },
  11: { year: '11 mln', label: 'Vandaag' },
}

function HistoryTimeline({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  return (
    <section className={classes.section} aria-labelledby="s-hist">
      <p className={classes.historyEyebrow}>Geschiedenis · Vier eeuwen</p>
      <h2 id="s-hist" className={classes.sectionTitle}>
        Van Sunda Kelapa naar Jakarta
      </h2>
      <p className={classes.historyLede}>
        De stad is in vierhonderd jaar viermaal omgedoopt. Elke naam markeert
        een machtswisseling — Portugees, Sultanaat, V.O.C., en wat erna kwam.
      </p>

      <div className={classes.historyStack}>
        {c.paragraphs.map((para, i) => {
          const anchor = HISTORY_ANCHORS[i]
          return (
            <div key={i} className={classes.historyRow} data-has-anchor={Boolean(anchor)}>
              <div className={classes.historyAnchor} aria-hidden={!anchor}>
                {anchor && (
                  <>
                    <span className={classes.historyAnchorYear}>{anchor.year}</span>
                    <span className={classes.historyAnchorLabel}>{anchor.label}</span>
                  </>
                )}
              </div>
              <p className={classes.historyParagraph} data-lede={i === 0}>{para}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Vocabulary — section 1 (49 items, chunked alphabetically) ─────────────

function VocabularyGrid({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  // Chunk into rough alphabetical bands. The data is already alphabetical;
  // we split on first-letter rather than fixed group sizes so each band
  // feels semantically coherent.
  const bands: { range: string; items: Item[] }[] = []
  const RANGES: { range: string; test: (ch: string) => boolean }[] = [
    { range: 'A — B', test: (ch) => ch >= 'a' && ch <= 'b' },
    { range: 'C — H', test: (ch) => ch >= 'c' && ch <= 'h' },
    { range: 'I — M', test: (ch) => ch >= 'i' && ch <= 'm' },
    { range: 'N — S', test: (ch) => ch >= 'n' && ch <= 's' },
    { range: 'T — Z', test: (ch) => ch >= 't' && ch <= 'z' },
  ]
  for (const r of RANGES) {
    const items = c.items.filter(it => r.test(it.indonesian.charAt(0).toLowerCase()))
    if (items.length > 0) bands.push({ range: r.range, items })
  }

  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · 49 woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>
        Voor het navigeren van Jakarta
      </h2>

      <div className={classes.vocabBands}>
        {bands.map((band, i) => (
          <div key={i} className={classes.vocabBand}>
            <p className={classes.vocabBandLabel}>{band.range}</p>
            <div className={classes.vocabGrid}>
              {band.items.map((item, j) => (
                <div key={j} className={classes.vocabChip}>
                  <PlayButton src={item.audioUrl} />
                  <span className={classes.vocabId}>{item.indonesian}</span>
                  <span className={classes.vocabNl}>{item.dutch}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Movement divider ──────────────────────────────────────────────────────

function MovementDivider({
  numeral,
  kicker,
  title,
  subtitle,
  tone,
}: {
  numeral: string
  kicker: string
  title: string
  subtitle: string
  tone: 'negation' | 'suffix' | 'time'
}) {
  return (
    <div className={classes.movementDivider} data-tone={tone}>
      <span className={classes.movementNumeral}>{numeral}</span>
      <div className={classes.movementHeading}>
        <p className={classes.movementKicker}>{kicker}</p>
        <h2 className={classes.movementTitle}>{title}</h2>
        <p className={classes.movementSubtitle}>{subtitle}</p>
      </div>
    </div>
  )
}

// ─── Movement I — Negation quartet (sections 2–5 as a 2×2 grid) ────────────
//
// Each of the four sections has exactly one category. We flatten them into
// four "negation cards" and lay them out in a 2×2 grid. The card is dense:
// title with a glyph chip, one or two rules underneath, up to 4 examples
// in a tight stack. Each card has its own accent colour.

type NegationCard = {
  word: string
  meaning: string
  rules: string[]
  examples: Example[]
  tone: 'belum' | 'bukan' | 'tidak' | 'jangan'
}

function buildNegationCards(): NegationCard[] {
  // Sections 2 (belum), 3 (bukan — two categories, we keep the first which
  // is the proper negation; the tag-question variant gets a sub-band below),
  // 4 (tidak), 5 (jangan).
  const belum = (sections[2].content as { categories: GrammarCategory[] }).categories[0]
  const bukan = (sections[3].content as { categories: GrammarCategory[] }).categories[0]
  const tidak = (sections[4].content as { categories: GrammarCategory[] }).categories[0]
  const jangan = (sections[5].content as { categories: GrammarCategory[] }).categories[0]
  return [
    { word: 'belum', meaning: 'nog niet', rules: belum.rules, examples: belum.examples ?? [], tone: 'belum' },
    { word: 'bukan', meaning: 'niet (znw.)', rules: bukan.rules, examples: bukan.examples ?? [], tone: 'bukan' },
    { word: 'tidak', meaning: 'niet (ww./bnw.)', rules: tidak.rules, examples: tidak.examples ?? [], tone: 'tidak' },
    { word: 'jangan', meaning: 'doe niet!', rules: jangan.rules, examples: jangan.examples ?? [], tone: 'jangan' },
  ]
}

function NegationQuartet() {
  const cards = buildNegationCards()
  // Tag-question variant of bukan (section 3, category 1) — render as a
  // single inline aside below the grid, since it's a footnote pattern.
  const tag = (sections[3].content as { categories: GrammarCategory[] }).categories[1]

  return (
    <section className={classes.section} aria-labelledby="s-neg">
      <MovementDivider
        numeral="I"
        kicker="Beweging één"
        title="Vier manieren om nee te zeggen"
        subtitle="Indonesisch heeft geen enkel woord voor 'niet'. Welke je kiest hangt af van wat je ontkent."
        tone="negation"
      />

      <div className={classes.negationGrid}>
        {cards.map((card) => (
          <article key={card.word} className={classes.negationCard} data-tone={card.tone}>
            <header className={classes.negationCardHeader}>
              <span className={classes.negationWord}>{card.word}</span>
              <span className={classes.negationMeaning}>{card.meaning}</span>
            </header>
            <ul className={classes.negationRules}>
              {card.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className={classes.negationExamples}>
              {card.examples.map((ex, i) => (
                <div key={i} className={classes.negationExample}>
                  <div className={classes.negationExampleId}>
                    <span>{ex.indonesian}</span>
                    <PlayButton src={ex.audioUrl} />
                  </div>
                  <div className={classes.negationExampleNl}>{ex.dutch}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <aside className={classes.negationAside}>
        <p className={classes.negationAsideKicker}>Voetnoot bij <em>bukan</em></p>
        <h3 className={classes.negationAsideTitle}>{tag.title}</h3>
        <ul className={classes.negationAsideRules}>
          {tag.rules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <div className={classes.negationAsideExamples}>
          {(tag.examples ?? []).map((ex, i) => (
            <div key={i} className={classes.negationExample}>
              <div className={classes.negationExampleId}>
                <span>{ex.indonesian}</span>
                <PlayButton src={ex.audioUrl} />
              </div>
              <div className={classes.negationExampleNl}>{ex.dutch}</div>
            </div>
          ))}
        </div>
      </aside>
    </section>
  )
}

// ─── Movement II — -lah vs -kah (side-by-side suffix pair) ─────────────────

function SuffixPair() {
  const lahSection = sections[6].content as { categories: GrammarCategory[] }
  const kahSection = sections[7].content as { categories: GrammarCategory[] }
  const lahMain = lahSection.categories[0]            // has rules + table
  const lahExamples = lahSection.categories[1]        // has examples only
  const kah = kahSection.categories[0]                // has rules + examples

  return (
    <section className={classes.section} aria-labelledby="s-suf">
      <MovementDivider
        numeral="II"
        kicker="Beweging twee"
        title="Twee kleine achtervoegsels"
        subtitle="Een woord wordt vriendelijker met -lah, nadrukkelijker met -kah. Twee letters, twee tonen."
        tone="suffix"
      />

      <div className={classes.suffixPair}>
        {/* -lah column */}
        <article className={classes.suffixCard} data-tone="lah">
          <header className={classes.suffixHeader}>
            <span className={classes.suffixGlyph}>—lah</span>
            <span className={classes.suffixCaption}>Beleefde imperatief</span>
          </header>
          <ul className={classes.suffixRules}>
            {lahMain.rules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {lahMain.table && (
            <div className={classes.suffixTableWrap}>
              <table className={classes.suffixTable}>
                <thead>
                  <tr>
                    {lahMain.table[0].map((h, i) => <th key={i}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lahMain.table.slice(1).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} data-col={j === 0 ? 'plain' : j === 1 ? 'lah' : 'gloss'}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={classes.suffixExHeading}>{lahExamples.title}</p>
          <div className={classes.suffixExamples}>
            {(lahExamples.examples ?? []).map((ex, i) => (
              <div key={i} className={classes.suffixExample}>
                <div className={classes.suffixExampleId}>
                  <span>{ex.indonesian}</span>
                  <PlayButton src={ex.audioUrl} />
                </div>
                <div className={classes.suffixExampleNl}>{ex.dutch}</div>
              </div>
            ))}
          </div>
        </article>

        {/* -kah column */}
        <article className={classes.suffixCard} data-tone="kah">
          <header className={classes.suffixHeader}>
            <span className={classes.suffixGlyph}>—kah</span>
            <span className={classes.suffixCaption}>Nadrukkelijke vraag</span>
          </header>
          <ul className={classes.suffixRules}>
            {kah.rules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className={classes.suffixExHeading}>Voorbeelden</p>
          <div className={classes.suffixExamples}>
            {(kah.examples ?? []).map((ex, i) => (
              <div key={i} className={classes.suffixExample}>
                <div className={classes.suffixExampleId}>
                  <span>{ex.indonesian}</span>
                  <PlayButton src={ex.audioUrl} />
                </div>
                <div className={classes.suffixExampleNl}>{ex.dutch}</div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

// ─── Movement III — Day parts strip + clock time ───────────────────────────
//
// The day-parts table gets visualised as a horizontal day-strip with tone
// shifts (night → dawn → morning → midday → afternoon → evening). The clock
// section follows in a quieter sub-band: glossary terms, then example times.

const DAY_PART_TONES: Record<string, string> = {
  malam: 'night',
  'larut malam (malam-malam)': 'deep-night',
  'pagi-pagi': 'dawn',
  pagi: 'morning',
  siang: 'midday',
  'sore (sore)': 'afternoon',
}

function TimeMovement() {
  const dayParts = (sections[8].content as { categories: GrammarCategory[] }).categories[0]
  const clockBlock = sections[9].content as { categories: GrammarCategory[] }
  const tijdsduur = clockBlock.categories[0]
  const klokWoorden = clockBlock.categories[1]
  const klokVoorbeelden = clockBlock.categories[2]

  const dayRows = (dayParts.table ?? []).slice(1)  // drop header row

  return (
    <section className={classes.section} aria-labelledby="s-time">
      <MovementDivider
        numeral="III"
        kicker="Beweging drie"
        title="De Indonesische klok"
        subtitle="Een nieuwe dag begint na zonsondergang. Het Nederlandse 'maandagavond' is hier al dinsdagavond."
        tone="time"
      />

      {/* Day-parts strip */}
      <div className={classes.dayStrip}>
        {dayRows.map((row, i) => {
          const tone = DAY_PART_TONES[row[0]] ?? 'midday'
          return (
            <div key={i} className={classes.dayBand} data-tone={tone}>
              <span className={classes.dayBandName}>{row[0]}</span>
              <span className={classes.dayBandTime}>{row[1]}</span>
              <span className={classes.dayBandGloss}>{row[2]}</span>
            </div>
          )
        })}
      </div>

      <p className={classes.dayStripNote}>{dayParts.rules[0]}</p>

      {/* Tijdsduur — duration */}
      <div className={classes.clockSub}>
        <p className={classes.clockSubKicker}>Tijdsduur</p>
        <p className={classes.clockSubLede}>{tijdsduur.rules[0]}</p>
        <div className={classes.clockExamples}>
          {(tijdsduur.examples ?? []).map((ex, i) => (
            <div key={i} className={classes.clockExample}>
              <div className={classes.clockExampleId}>
                <span>{ex.indonesian}</span>
                <PlayButton src={ex.audioUrl} />
              </div>
              <div className={classes.clockExampleNl}>{ex.dutch}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Kloktijd — words + rules */}
      <div className={classes.clockSub}>
        <p className={classes.clockSubKicker}>Kloktijd · woorden &amp; regels</p>
        <ul className={classes.clockRules}>
          {klokWoorden.rules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        {klokWoorden.table && (
          <div className={classes.clockGlossary}>
            {klokWoorden.table.slice(1).map((row, i) => (
              <div key={i} className={classes.clockGlossaryRow}>
                <span className={classes.clockGlossaryId}>{row[0]}</span>
                <span className={classes.clockGlossaryGloss}>{row[2]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kloktijd — examples (specific times) */}
      <div className={classes.clockSub}>
        <p className={classes.clockSubKicker}>Kloktijd · voorbeelden</p>
        <div className={classes.clockTimeList}>
          {(klokVoorbeelden.examples ?? []).map((ex, i) => (
            <div key={i} className={classes.clockTimeRow}>
              <span className={classes.clockTimeStamp}>{ex.dutch}</span>
              <span className={classes.clockTimeId}>
                {ex.indonesian}
                <PlayButton src={ex.audioUrl} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson6Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero band — Jakarta panorama under teal/navy/amber gradient */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Jakarta</span>
              <span className={classes.heroTitleNl}>De hoofdstad in vier eeuwen</span>
            </h1>
            <p className={classes.heroDescription}>
              Een stad met vier namen — Sunda Kelapa, Jayakarta, Batavia, Jakarta —
              en de taal om er rond te navigeren. Vier soorten ontkenning, twee
              beleefdheidsachtervoegsels, en een klok die anders begint dan de jouwe.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            In een stad die viermaal omgedoopt is, leer je <em>vier manieren om nee te zeggen</em>,
            twee om beleefd of nadrukkelijk te zijn, en dat de dag bij zonsondergang begint —
            niet bij middernacht.
          </p>
          <p className={classes.ledeMeta}>Les 6 · A1 · Grammatica-zwaar</p>
        </div>
      </section>

      {/* Main content shell */}
      {/* Lesson audio */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} />
          </div>
        </section>
      )}

      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <HistoryTimeline section={sections[0]} />
          <VocabularyGrid  section={sections[1]} />
          <NegationQuartet />
          <SuffixPair />
          <TimeMovement />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woorden, patronen en kloktijden verschijnen
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
