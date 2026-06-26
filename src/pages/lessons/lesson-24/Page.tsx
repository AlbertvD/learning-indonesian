// Lesson 24 — Bab 8 · Surat dari Indonesia (Een brief uit Indonesië) — bespoke reader page.
//
// This chapter is built around CORRESPONDENCE. The source opens with a real
// letter: Nurul, a fifth-grader in the village of Maninjau (Kabupaten Agam,
// West Sumatra), writes to her Dutch "Ibu" in November 1996 — about school,
// the flooded roads of the rainy season, the bicycle she lends to neighbours,
// and her wish for a tulip postcard from a country 12.000 km away. We lead
// with that letter as an actual letter: a paper-toned sheet with a dateline,
// salutation, body, and signature.
//
// The grammar is the heart of the lesson: the CONTRAST between the -KAN and
// -i suffixes. Five categories move from the general relationship, through
// the static/dynamic-agent schema, the focus shift of -i (mengirimi Adi
// surat), the minimal pairs (mendudukkan ↔ menduduki), and a reference table
// of base words that take BOTH affixes. The minimal-pairs material is
// rendered as side-by-side -KAN-vs-i columns; the both-affix base words as a
// genuine four-column table.
//
// A second text section — "Het schrijven van een brief in het Indonesisch" —
// closes the reading as a practical correspondence guide: the parts of a
// letter, a worked sample, opening/closing phrases as NL↔ID pairs, and an
// abbreviations reference table.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 24 --pretty > src/pages/lessons/lesson-24/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

const meta = content.meta
const sections = content.sections

type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = {
  title: string
  rules: string[]
  examples?: Example[]
  table?: string[][]
}
type Item = { dutch: string; indonesian: string; audioUrl?: string }

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

// ─── Section 1: The letter — rendered as actual correspondence ─────────────
//
// p0  → dateline (Maninjau, 8 Nopember 1996 / Kabupaten Agam, Sumbar)
// p1  → salutation (Ibu yang tercinta,)
// p2..p6 → body paragraphs
// p7  → sign-off (Salam hangat, / Nurul)

function LetterSheet({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const p = c.paragraphs
  const [datelinePlace, datelineRegion] = p[0].split('\n')
  const salutation = p[1]
  const body = p.slice(2, p.length - 1)
  const [signOff, , signatory] = p[p.length - 1].split('\n')

  return (
    <section className={classes.section} aria-labelledby="s-letter">
      <p className={classes.letterEyebrow}>De brief · Maninjau, West-Sumatra</p>
      <h2 id="s-letter" className={classes.sectionTitle}>
        Een meisje schrijft naar Nederland — november 1996
      </h2>

      <article className={classes.letterSheet}>
        <div className={classes.letterDateline}>
          <span className={classes.letterDatelinePlace}>{datelinePlace}</span>
          <span className={classes.letterDatelineRegion}>{datelineRegion}</span>
        </div>

        <p className={classes.letterSalutation}>{salutation}</p>

        {body.map((para, i) => (
          <p key={i} className={classes.letterBody}>{para}</p>
        ))}

        <div className={classes.letterSignature}>
          <span className={classes.letterSignOff}>{signOff}</span>
          <span className={classes.letterSignatory}>{signatory}</span>
        </div>
      </article>
    </section>
  )
}

// ─── Section 2: Grammar — the -KAN vs -i contrast ──────────────────────────
//
// Five categories. We give the whole section a "minimal-pairs" treatment:
// every example list of three (root → -kan → -i) is read as a contrast.
// Categories 4 and 5 carry the richest material — the duduk/tinggal/gambar
// minimal pairs (category 4, examples) and the both-affix base-word table
// (category 5, `table`).

const GRAMMAR_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green'] as const

// The base-word / -i-form / -kan-form comparison table.
function BothAffixTable({ table }: { table: string[][] }) {
  const [head, ...rows] = table
  return (
    <div className={classes.affixTableWrap}>
      <table className={classes.affixTable}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className={i >= 2 ? classes.affixHeadForm : classes.affixHead}
                data-form={i === 2 ? 'i' : i === 3 ? 'kan' : undefined}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const [base, meaning, iForm, kanForm] = row
            return (
              <tr key={i}>
                <th scope="row" className={classes.affixBase}>{base}</th>
                <td className={classes.affixMeaning}>{meaning}</td>
                <td className={classes.affixForm} data-form="i">{iForm}</td>
                <td className={classes.affixForm} data-form="kan">{kanForm}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · ·KAN tegenover ·i</p>
      <h2 id="s-gram" className={classes.sectionTitle}>
        Hetzelfde basiswoord, twee betekenissen
      </h2>

      <div className={classes.grammarRules}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.grammarTile} data-accent={GRAMMAR_ACCENTS[i % GRAMMAR_ACCENTS.length]}>
            <header className={classes.grammarTileHeader}>
              <span className={classes.grammarTileNumber}>{`0${i + 1}`.slice(-2)}</span>
              <h3 className={classes.grammarTileTitle}>{cat.title}</h3>
            </header>
            <div className={classes.grammarTileBody}>
              <ul className={classes.grammarTileRules}>
                {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
              </ul>

              {cat.table && <BothAffixTable table={cat.table} />}

              {cat.examples && cat.examples.length > 0 && (
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

// ─── Section 3: Vocabulary — 40 words from the letter ──────────────────────

function VocabSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De taal van de brief — {c.items.length} woorden</h2>

      <div className={classes.itemGrid}>
        {c.items.map((item, i) => (
          <div key={i} className={classes.itemChip}>
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

// ─── Section 4: Letter-writing guidance ─────────────────────────────────────
//
// The second `text` section is a practical guide. Its paragraphs carry
// distinct structures that we parse and lay out individually:
//   p0  → the four parts of a letter (a..d, "NL - ID")
//   p1  → a worked sample letter (monospace sheet)
//   p2  → opening greetings (two-column ID | NL)
//   p3  → opening sentences (ID over NL pairs)
//   p4  → closing sentences (ID over NL pairs) + sign-offs table
//   p5  → abbreviations reference table (afk · word · NL)

// Parse "left   right" two-column lines (split on run of 2+ spaces).
function splitColumns(line: string): [string, string] {
  const m = line.split(/\s{2,}/)
  return [m[0]?.trim() ?? '', m.slice(1).join(' ').trim()]
}

function LetterGuide({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const p = c.paragraphs

  // p0 — the four parts: skip the lead line, parse "a. ID - NL"
  const partsLines = p[0].split('\n').filter((l) => /^[a-d]\./.test(l.trim()))
  const parts = partsLines.map((l) => {
    const body = l.replace(/^[a-d]\.\s*/, '')
    const [nl, id] = body.split(' - ').map((s) => s.trim())
    return { nl, id }
  })

  // p1 — worked sample letter (drop the "Voorbeeldbrief:" lead line)
  const sampleLines = p[1].split('\n').slice(1).join('\n').trim()

  // p2 — opening greetings: skip lead line, parse two-column rows
  const greetingRows = p[2].split('\n').slice(2).filter((l) => l.trim()).map(splitColumns)

  // p3 / p4 — sentence banks: skip lead line, group ID/NL line pairs
  const parseSentenceBank = (block: string) => {
    const lines = block.split('\n').slice(2).map((l) => l.trim())
    const pairs: Array<{ id: string; nl: string }> = []
    let pending = ''
    for (const line of lines) {
      if (!line) { pending = ''; continue }
      if (!pending) pending = line
      else { pairs.push({ id: pending, nl: line }); pending = '' }
    }
    return pairs
  }
  const openingSentences = parseSentenceBank(p[3])

  // p4 — closing sentences, then a sign-off table at the tail (two-col rows)
  const closingRaw = p[4].split('\n').slice(2)
  const signOffStart = closingRaw.findIndex((l) => /Hormat kami|Hormat saya/.test(l))
  const closingSentencePairs = parseSentenceBank('x\n' + closingRaw.slice(0, signOffStart).join('\n'))
  const signOffRows = closingRaw.slice(signOffStart).filter((l) => l.trim()).map(splitColumns)

  // p5 — abbreviations: skip lead line, parse three-column "afk word NL"
  const abbrevRows = p[5].split('\n').slice(2).filter((l) => l.trim()).map((l) => {
    const cols = l.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
    return { afk: cols[0] ?? '', word: cols[1] ?? '', nl: cols.slice(2).join(' ') }
  })

  return (
    <section className={classes.section} aria-labelledby="s-guide">
      <p className={classes.guideEyebrow}>Praktijk · Een brief schrijven</p>
      <h2 id="s-guide" className={classes.sectionTitle}>Het schrijven van een brief in het Indonesisch</h2>

      {/* The four parts */}
      <div className={classes.guideBlock}>
        <p className={classes.guideBlockTitle}>De vier onderdelen</p>
        <div className={classes.partsRow}>
          {parts.map((part, i) => (
            <div key={i} className={classes.partCell}>
              <span className={classes.partIndex}>{String.fromCharCode(97 + i)}</span>
              <span className={classes.partId}>{part.id}</span>
              <span className={classes.partNl}>{part.nl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Worked sample */}
      <div className={classes.guideBlock}>
        <p className={classes.guideBlockTitle}>Voorbeeldbrief</p>
        <pre className={classes.sampleSheet}>{sampleLines}</pre>
      </div>

      {/* Opening greetings — two-column phrase table */}
      <div className={classes.guideBlock}>
        <p className={classes.guideBlockTitle}>Openingsgroeten</p>
        <div className={classes.phraseList}>
          {greetingRows.map(([id, nl], i) => (
            <div key={i} className={classes.phraseRow}>
              <span className={classes.phraseId}>{id}</span>
              <span className={classes.phraseNl}>{nl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Opening & closing sentence banks */}
      <div className={classes.guideBlock}>
        <p className={classes.guideBlockTitle}>Openingszinnen</p>
        <div className={classes.sentenceBank}>
          {openingSentences.map((s, i) => (
            <div key={i} className={classes.sentencePair}>
              <span className={classes.sentenceId}>{s.id}</span>
              <span className={classes.sentenceNl}>{s.nl}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={classes.guideBlock}>
        <p className={classes.guideBlockTitle}>Afsluitende zinnen</p>
        <div className={classes.sentenceBank}>
          {closingSentencePairs.map((s, i) => (
            <div key={i} className={classes.sentencePair}>
              <span className={classes.sentenceId}>{s.id}</span>
              <span className={classes.sentenceNl}>{s.nl}</span>
            </div>
          ))}
        </div>
        <div className={classes.signOffList}>
          {signOffRows.map(([id, nl], i) => (
            <div key={i} className={classes.signOffRow}>
              <span className={classes.signOffId}>{id}</span>
              <span className={classes.signOffNl}>{nl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Abbreviations reference */}
      <div className={classes.guideBlock}>
        <p className={classes.guideBlockTitle}>Afkortingen</p>
        <div className={classes.abbrevGrid}>
          {abbrevRows.map((row, i) => (
            <div key={i} className={classes.abbrevCell}>
              <span className={classes.abbrevAfk}>{row.afk}</span>
              <span className={classes.abbrevWord}>{row.word}</span>
              <span className={classes.abbrevNl}>{row.nl}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson24Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — Lake Maninjau, West Sumatra, under a warm correspondence wash */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Surat dari Indonesia</span>
              <span className={classes.heroTitleNl}>Een brief uit Indonesië</span>
            </h1>
            <p className={classes.heroDescription}>
              Nurul woont in Maninjau, een dorp tussen de sawah's in West-Sumatra.
              Het is regenseizoen, de wegen staan blank, en ze schrijft naar haar
              Nederlandse Ibu — over school, haar fiets en een wens om ooit een
              ansichtkaart met tulpen te krijgen. Daarna: hoe je zelf een brief
              schrijft, en het verschil tussen de achtervoegsels ·KAN en ·i.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — the page's voice */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een brief reist <em>12.000 kilometer</em>. Hij vertelt over banjir en
            een geleende fiets, maar leert je ook iets fijns: dat ·KAN en ·i
            hetzelfde basiswoord twee kanten op kunnen sturen — iets in beweging
            zetten, of een handeling op een vast punt richten.
          </p>
          <p className={classes.ledeMeta}>Les 24 · {meta.level} · Surat dari Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — guarded; lights up when audio_path is set */}
      <LessonGrammarAudioBand
        nl={meta.lesson_audio_url}
        en={meta.lesson_audio_url_en}
        voice={meta.primary_voice ?? undefined}
        bandClassName={classes.audioBand}
        innerClassName={classes.audioInner}
      />

      {/* Main content — single column, aligned to lede width */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <LetterSheet section={sections[0]} />
          <GrammarSection section={sections[2]} />
          <VocabSection section={sections[1]} />
          <LetterGuide section={sections[3]} />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de woorden, de ·KAN/·i-paren en de briefuitdrukkingen
            verschijnen automatisch in je oefensessies.
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
