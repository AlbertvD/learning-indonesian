// Lesson 7 — Libur Sekolah (Schoolvakantie) — bespoke reader page.
//
// Two voices live in this lesson, and the page hinges on the gap between them:
//
//   - A kitchen scene: Ninik en haar moeder pakken de koffer voor Bali. Het
//     hele dialoog gaat over kleding, sieraden, een vergeten haarspeld. Modern,
//     huiselijk, Indonesisch alledaags.
//
//   - Een mythologische saga: Garuda — vogel-van-de-zon, zoon van Winata —
//     vliegt door donderslagen en vlammenzeeen om de godendrank te halen.
//     Hindoeistisch, episch.
//
// Tussen die twee zit een naadje: Garuda is óók de naam van de Indonesische
// luchtvaartmaatschappij. Ninik vliegt waarschijnlijk Garuda naar Denpasar.
// De mythe is daarmee niet een culturele bijlage — het is de *vleugel onder
// het vliegtuig* dat de hele les vervoert.
//
// Compositie:
//   1. Hero (Kuta-zonsondergang) — de bestemming.
//   2. Lede (de bestemming + de mythe naast elkaar).
//   3. Dialoog — Ninik & Ibu pakken in.
//   4. Grammar I: -nya in drie gedaantes (bezit / topicalisatie / nominalisatie)
//      — gerenderd als één centrale "drie-zinnen-machine" met de zin
//      "Mobil itu warnanya putih" als levend voorbeeld.
//   5. Grammar II: Tijd — kalender-layout (eenheden, dan maanden als grid,
//      dan dagen als week-strip, dan een kemarin↔besok tijdlijn).
//   6. Vocabulaire (60) — als inpaklijst gepresenteerd, omdat de dialoog
//      letterlijk over inpakken gaat.
//   7. Uitdrukkingen — twee zinnen, intiem getoond.
//   8. Garuda — de mythe als slot-essay, met dropcap en marginale glossen.
//   9. CTA-band.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 7 --pretty > src/pages/lessons/lesson-7/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { PracticeActions } from '@/components/lessons/PracticeActions'
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

// ─── Section: Dialogue — packing for Bali ──────────────────────────────────

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

function speakerTone(speaker: string): 'ibu' | 'ninik' | 'narrator' | 'other' {
  const s = speaker.toLowerCase()
  if (s.includes('narrator')) return 'narrator'
  if (s.includes('ibu')) return 'ibu'
  if (s.includes('ninik')) return 'ninik'
  return 'other'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Inpakken voor Denpasar</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Ninik en haar moeder, op donderdag</h2>
        <p className={classes.dialogueSetup}>
          Ninik heeft schoolvakantie en gaat met haar moeder een week naar Bali.
          De koffer ligt open op het bed, en de telling van wat erin moet — en
          wat juist niet — is een gesprek op zich. Tussen sieraden, een gele
          T-shirt en een vergeten haarspeld komt het hele werkwoord <em>bawa</em>
          (meenemen) langs.
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

// ─── Section: Grammar I — three faces of -nya ──────────────────────────────
//
// The lesson's grammatical heartbeat is the suffix -nya. Three categories:
//   01 bezittelijk     ("Sepedanya hitam")
//   02 topicalisatie   (one sentence, three permutations)
//   03 nominalisatie   ("Pohon itu tingginya 18 meter")
//
// Treat the topicalisation as the showpiece: render the three permutations of
// "Mobil itu warnanya putih" as a single stacked transformation, with -nya
// highlighted everywhere it appears. The two satellites (bezit / nominalisatie)
// flank it as smaller side-cards.

type GrammarExample = { indonesian: string; dutch: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples?: GrammarExample[] }

// Wrap every occurrence of -nya in a coloured pill so the pattern reads at a glance.
function highlightNya(text: string): React.ReactNode {
  // match a word ending in "nya" but only the trailing suffix (split by suffix)
  const parts: React.ReactNode[] = []
  let i = 0
  const re = /(\w+?)(nya)\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(i, match.index)
    if (before) parts.push(<span key={`b-${i}`}>{before}</span>)
    parts.push(<span key={`s-${match.index}`}>{match[1]}</span>)
    parts.push(<em key={`n-${match.index}`} className={classes.nyaMark}>{match[2]}</em>)
    i = match.index + match[0].length
  }
  if (i < text.length) parts.push(<span key={`tail`}>{text.slice(i)}</span>)
  return parts.length > 0 ? parts : text
}

function NyaGrammar({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const possessive    = c.categories[0]
  const topicalisatie = c.categories[1]
  const nominalisatie = c.categories[2]

  // The topicalisation category lists its three constructions as rules — pull
  // them out so we can render each one as a coloured line. Each rule line is
  // shaped like "Constructie N (A B C): Warna mobil itu putih".
  const constructies = (topicalisatie?.rules ?? [])
    .filter((r) => r.startsWith('Constructie'))
    .map((r) => {
      const [head, ...rest] = r.split(': ')
      return { head: head.trim(), sentence: rest.join(': ').trim() }
    })
  const headlineLine = topicalisatie?.rules?.find((r) => r.toLowerCase().includes('nadruk'))

  return (
    <section className={classes.section} aria-labelledby="s-nya">
      <p className={classes.nyaEyebrow}>De ene letter die alles draagt</p>
      <h2 id="s-nya" className={classes.sectionTitle}>
        <em className={classes.nyaMarkTitle}>-nya</em> — een suffix met drie gedaantes
      </h2>
      <p className={classes.nyaIntro}>
        Drie letters, achter een woord geplakt, en plotseling verandert er iets.
        In de dialoog hierboven: &ldquo;Ninik <em>cincinnya</em> bagus&rdquo;
        — Ninik haar ring is mooi. Vergeet niet je <em>kopernya</em>. Maar
        precies hetzelfde suffix verandert ook hoe een hele zin wordt
        gerangschikt.
      </p>

      {/* Centerpiece: the topicalisation triptych */}
      <div className={classes.topicalisatie}>
        <p className={classes.topicalisatieKicker}>De drie zinnen van een idee</p>
        <p className={classes.topicalisatieHint}>
          Dezelfde mededeling — &ldquo;de kleur van die auto is wit&rdquo; —
          in drie correcte volgordes. De woordgroep die vooraan staat krijgt
          de meeste nadruk.
        </p>
        <ol className={classes.constructies}>
          {constructies.map((con, i) => (
            <li key={i} className={classes.constructie} data-rank={i}>
              <span className={classes.constructieNumber}>{`0${i + 1}`}</span>
              <span className={classes.constructieHead}>{con.head}</span>
              <span className={classes.constructieSentence}>{highlightNya(con.sentence)}</span>
            </li>
          ))}
        </ol>
        {headlineLine && (
          <p className={classes.topicalisatieFoot}>{headlineLine}</p>
        )}
      </div>

      {/* The two flanking cases — bezit and nominalisatie */}
      <div className={classes.nyaFlanks}>
        <article className={classes.nyaFlank} data-flank="possessive">
          <header className={classes.nyaFlankHeader}>
            <span className={classes.nyaFlankNumber}>·01</span>
            <h3 className={classes.nyaFlankTitle}>Bezit</h3>
          </header>
          <p className={classes.nyaFlankRubric}>
            Achter een zelfstandig naamwoord = <em>zijn / haar / hun</em>.
          </p>
          <div className={classes.nyaFlankExamples}>
            {(possessive?.examples ?? []).map((ex, i) => (
              <div key={i} className={classes.nyaFlankExample}>
                <div className={classes.nyaFlankId}>
                  {highlightNya(ex.indonesian)}
                  <PlayButton src={ex.audioUrl} />
                </div>
                <div className={classes.nyaFlankNl}>{ex.dutch}</div>
              </div>
            ))}
          </div>
          <p className={classes.nyaFlankRule}>
            Maar nooit achter een eigennaam: <strong>Rumah Tuti</strong>,
            niet <s>Tutinya rumah</s>.
          </p>
        </article>

        <article className={classes.nyaFlank} data-flank="nominalisation">
          <header className={classes.nyaFlankHeader}>
            <span className={classes.nyaFlankNumber}>·03</span>
            <h3 className={classes.nyaFlankTitle}>Nominalisatie</h3>
          </header>
          <p className={classes.nyaFlankRubric}>
            Achter een bijvoeglijk naamwoord = <em>de eigenschap</em>. Vaak
            voor maten en afstanden.
          </p>
          <div className={classes.nyaFlankExamples}>
            {(nominalisatie?.examples ?? []).map((ex, i) => (
              <div key={i} className={classes.nyaFlankExample}>
                <div className={classes.nyaFlankId}>
                  {highlightNya(ex.indonesian)}
                  <PlayButton src={ex.audioUrl} />
                </div>
                <div className={classes.nyaFlankNl}>{ex.dutch}</div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

// ─── Section: Grammar II — Time, as a calendar layout ─────────────────────
//
// Five categories, each gets its own visual:
//   - Tijdseenheden  -> small ladder (hari/minggu/bulan/tahun/abad)
//   - Maanden        -> 12-cell grid (calendar months)
//   - Dagen          -> horizontal week-strip
//   - Tijdsbepalingen -> a kemarin↔hari ini↔besok timeline + four examples
//   - Zinsbouw       -> a short rules card with examples

type GrammarTable = string[][]
type TimeCategory = {
  title: string
  rules?: string[]
  table?: GrammarTable
  examples?: GrammarExample[]
}

const MONTH_SEASONS: Array<'cool' | 'warm' | 'hot' | 'wet'> = [
  'wet',  // jan
  'wet',  // feb
  'wet',  // mar — end of monsoon
  'warm', // apr
  'cool', // mei
  'cool', // juni
  'cool', // juli
  'warm', // aug
  'warm', // sep
  'hot',  // okt
  'wet',  // nov
  'wet',  // dec
]

function TimeGrammar({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: TimeCategory[] }
  const eenheden = c.categories.find((cat) => cat.title === 'Tijdseenheden')
  const maanden  = c.categories.find((cat) => cat.title === 'Maanden (bulan)')
  const dagen    = c.categories.find((cat) => cat.title.startsWith('Dagen'))
  const bepaling = c.categories.find((cat) => cat.title === 'Tijdsbepalingen')
  const zinsbouw = c.categories.find((cat) => cat.title.startsWith('Zinsbouw'))

  // Tijdsbepalingen: the rules are dense ("kemarin dulu = eergisteren, kemarin
  // = gisteren, hari ini = vandaag, besok = morgen, lusa = overmorgen"). Parse
  // out the day-axis words so we can render a literal timeline.
  const dayAxis = [
    { word: 'kemarin dulu', nl: 'eergisteren', offset: -2 },
    { word: 'kemarin',      nl: 'gisteren',    offset: -1 },
    { word: 'hari ini',     nl: 'vandaag',     offset:  0 },
    { word: 'besok',        nl: 'morgen',      offset:  1 },
    { word: 'lusa',         nl: 'overmorgen',  offset:  2 },
  ]
  const timeAxis = [
    { word: 'tadi',  nl: 'zoeven, daarnet' },
    { word: 'nanti', nl: 'straks' },
  ]
  const horizonRules = (bepaling?.rules ?? []).filter((r) =>
    r.startsWith('dulu') || r.startsWith('lalu')
  )

  return (
    <section className={classes.section} aria-labelledby="s-time">
      <p className={classes.timeEyebrow}>Een week, een jaar, een eeuw</p>
      <h2 id="s-time" className={classes.sectionTitle}>Hoe Indonesisch tijd uitspreekt</h2>

      {/* Block 1: tijdseenheden — a vertical ladder, smallest → largest */}
      {eenheden?.table && (
        <div className={classes.timeUnits}>
          <p className={classes.timeBlockHeading}>Tijdseenheden</p>
          <div className={classes.timeUnitsRail}>
            {eenheden.table.map((row, i) => (
              <div key={i} className={classes.timeUnit}>
                <span className={classes.timeUnitId}>{row[0]}</span>
                <span className={classes.timeUnitNl}>{row[1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block 2: maanden — calendar grid */}
      {maanden?.table && (
        <div className={classes.timeMonths}>
          <p className={classes.timeBlockHeading}>Maanden — <em>bulan</em></p>
          <p className={classes.timeBlockRubric}>
            Twaalf maanden, allemaal voorafgegaan door <em>bulan</em>.
            Met hoofdletter — net als de dagen.
          </p>
          <div className={classes.timeMonthsGrid}>
            {maanden.table.map((row, i) => {
              // row[0] is "bulan Januari" — split off "bulan" for visual rhythm
              const parts = row[0].split(' ')
              const prefix = parts[0]
              const name = parts.slice(1).join(' ')
              return (
                <article key={i} className={classes.timeMonth} data-season={MONTH_SEASONS[i]}>
                  <span className={classes.timeMonthIndex}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={classes.timeMonthName}>
                    <span className={classes.timeMonthPrefix}>{prefix}</span>
                    <span className={classes.timeMonthHead}>{name}</span>
                  </span>
                  <span className={classes.timeMonthNl}>{row[1]}</span>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {/* Block 3: dagen — a horizontal week-strip */}
      {dagen?.table && (
        <div className={classes.timeDays}>
          <p className={classes.timeBlockHeading}>Dagen — <em>hari</em></p>
          <div className={classes.timeWeekStrip}>
            {dagen.table.slice(0, 7).map((row, i) => (
              <div key={i} className={classes.timeDay} data-weekend={i >= 5}>
                <span className={classes.timeDayNl}>{row[1]}</span>
                <span className={classes.timeDayId}>{row[0].replace('hari ', '')}</span>
              </div>
            ))}
          </div>
          {dagen.table.length > 7 && (
            <div className={classes.timeDayExtras}>
              {dagen.table.slice(7).map((row, i) => (
                <div key={i} className={classes.timeDayExtra}>
                  <span className={classes.timeDayExtraId}>{row[0]}</span>
                  <span className={classes.timeDayExtraNl}>{row[1]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Block 4: tijdsbepalingen — kemarin↔besok timeline */}
      {bepaling && (
        <div className={classes.timeHorizon}>
          <p className={classes.timeBlockHeading}>Tijdshorizon — vroeger, nu, straks</p>
          <div className={classes.timeAxis}>
            {dayAxis.map((d) => (
              <div key={d.word} className={classes.timeAxisCell} data-offset={d.offset}>
                <span className={classes.timeAxisWord}>{d.word}</span>
                <span className={classes.timeAxisNl}>{d.nl}</span>
              </div>
            ))}
          </div>
          <div className={classes.timeAxisSub}>
            {timeAxis.map((t) => (
              <div key={t.word} className={classes.timeAxisSubCell}>
                <span className={classes.timeAxisWord}>{t.word}</span>
                <span className={classes.timeAxisNl}>{t.nl}</span>
              </div>
            ))}
          </div>
          {horizonRules.length > 0 && (
            <ul className={classes.timeAxisRules}>
              {horizonRules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {bepaling.examples && bepaling.examples.length > 0 && (
            <div className={classes.timeAxisExamples}>
              {bepaling.examples.map((ex, i) => (
                <div key={i} className={classes.timeAxisExample}>
                  <div className={classes.timeAxisExampleId}>
                    {ex.indonesian}
                    <PlayButton src={ex.audioUrl} />
                  </div>
                  <div className={classes.timeAxisExampleNl}>{ex.dutch}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Block 5: zinsbouw — short doctrine card */}
      {zinsbouw && (
        <div className={classes.timeSyntax}>
          <p className={classes.timeBlockHeading}>Waar de tijdsbepaling staat</p>
          <ul className={classes.timeSyntaxRules}>
            {zinsbouw.rules?.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {zinsbouw.examples && zinsbouw.examples.length > 0 && (
            <div className={classes.timeSyntaxExamples}>
              {zinsbouw.examples.map((ex, i) => (
                <div key={i} className={classes.timeSyntaxExample}>
                  <div className={classes.timeSyntaxId}>
                    {ex.indonesian}
                    <PlayButton src={ex.audioUrl} />
                  </div>
                  <div className={classes.timeSyntaxNl}>{ex.dutch}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Section: Vocabulary — packing-list framed ─────────────────────────────

type Item = { dutch: string; indonesian: string; audioUrl?: string }

function VocabularyPackingList({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Inpaklijst · {c.items.length} woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Alles wat in deze les voorbijkomt</h2>
      <p className={classes.vocabHint}>
        Kleding, sieraden, dagen van de week, kleine reisvocabulaire — een
        lijst om naar terug te bladeren. De sterretjes (<em>*</em>) zijn al
        vervoegingen die je in latere lessen tegenkomt.
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

// ─── Section: Expressions — two short statements ───────────────────────────

function ExpressionsDuet({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.exprEyebrow}>Twee zinnen voor onderweg</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Wat je in dit hoofdstuk ook nog leert</h2>

      <div className={classes.exprDuet}>
        {c.items.map((item, i) => (
          <article key={i} className={classes.exprCard} data-rank={i}>
            <span className={classes.exprMark}>0{i + 1}</span>
            <div className={classes.exprId}>
              {item.indonesian}
              <PlayButton src={item.audioUrl} />
            </div>
            <div className={classes.exprNl}>{item.dutch}</div>
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Garuda myth — closing essay spread ───────────────────────────
//
// 15 paragraphs of Indonesian myth (Garuda, son of Winata, who flies through
// fire to steal the gods' drink and earn his mother's freedom). The piece is
// long; we render it editorially:
//   - dropped first paragraph as the opener with a big initial
//   - vertical column of essay paragraphs
//   - marginal callouts pull key proper nouns out (Garuda, Winata, Kadru,
//     Mahameru, amerta) so the reader has anchors

type MythAnchor = { paraIndex: number; name: string; gloss: string }

const MYTH_ANCHORS: MythAnchor[] = [
  { paraIndex: 2,  name: 'Garuda',   gloss: 'vogel-van-de-zon' },
  { paraIndex: 3,  name: 'Winata',   gloss: 'moeder, godin' },
  { paraIndex: 3,  name: 'Kadru',    gloss: 'zus, mokende winnares' },
  { paraIndex: 6,  name: 'amerta',   gloss: 'godendrank, onsterfelijkheid' },
  { paraIndex: 11, name: 'Mahameru', gloss: 'de godenberg' },
  { paraIndex: 14, name: 'Indra',    gloss: 'god van de hemel' },
]

function GarudaMyth({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  // Anchor lookup keyed by paragraph index.
  const anchorMap = new Map<number, MythAnchor[]>()
  for (const a of MYTH_ANCHORS) {
    const arr = anchorMap.get(a.paraIndex) ?? []
    arr.push(a)
    anchorMap.set(a.paraIndex, arr)
  }
  return (
    <section className={classes.section} aria-labelledby="s-myth">
      <div className={classes.mythBand}>
        <p className={classes.mythKicker}>Cultuur · De mythe van Garuda</p>
        <h2 id="s-myth" className={classes.mythDisplay}>
          De vogel-van-de-zon
          <span className={classes.mythDisplaySub}>en hoe de slang aan zijn gespleten tong kwam</span>
        </h2>

        <div className={classes.mythProse}>
          {c.paragraphs.map((para, i) => {
            const anchors = anchorMap.get(i) ?? []
            return (
              <div key={i} className={classes.mythRow} data-has-anchor={anchors.length > 0}>
                <div className={classes.mythAnchorCol} aria-hidden={anchors.length === 0}>
                  {anchors.map((a) => (
                    <div key={a.name} className={classes.mythAnchor}>
                      <span className={classes.mythAnchorName}>{a.name}</span>
                      <span className={classes.mythAnchorGloss}>{a.gloss}</span>
                    </div>
                  ))}
                </div>
                <p className={classes.mythPara} data-opener={i === 0}>{para}</p>
              </div>
            )
          })}
        </div>

        <p className={classes.mythCoda}>
          De Garuda is op het wapenschild van de Republiek Indonesia gebleven,
          en op de staart van de nationale luchtvaartmaatschappij — de
          vleugels die Ninik morgen naar Bali brengen.
        </p>
      </div>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson7Page() {
  // Section index map (DB order):
  //   0: text — Garuda myth (15 paragraphs)
  //   1: dialogue — Ninik & Ibu packing for Denpasar (14 lines)
  //   2: vocabulary (60 items)
  //   3: expressions (2 items)
  //   4: grammar — -nya constructions (3 categories)
  //   5: grammar — time expressions (5 categories)
  //   6: exercises (skipped)
  return (
    <article className={classes.page}>
      {/* Hero band — Kuta sunset, blended under a violet→amber gradient */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Libur Sekolah</span>
              <span className={classes.heroTitleNl}>Schoolvakantie</span>
            </h1>
            <p className={classes.heroDescription}>
              Ninik heeft schoolvakantie, en moeder pakt een koffer voor een
              week Denpasar. Eronder een veel oudere reis: Garuda, de
              vogel-van-de-zon, vliegt door donder en vlammen om de drank der
              goden te halen. Allebei keren ze terug — de een met sandalen
              gekocht in Kuta, de ander met een kruikje amerta.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — sets the dual voice */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een Indonesische les is zelden over één ding. Hier zit een
            dagboek-dialoog over inpakken naast een eeuwenoude mythe — en
            tussen die twee een suffix van drie letters, <em>-nya</em>, dat
            in elke zin het bezit, het onderwerp of de eigenschap aanwijst.
          </p>
          <p className={classes.ledeMeta}>Les 7 · A2 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Main content — single column */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <DialogueScene          section={sections[1]} />
          <NyaGrammar             section={sections[4]} />
          <TimeGrammar            section={sections[5]} />
          <ExpressionsDuet        section={sections[3]} />
          <VocabularyPackingList  section={sections[2]} />
          <GarudaMyth             section={sections[0]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les — en de <em>-nya</em>-constructies, de dagen,
            de maanden en het reisvocabulaire komen vanzelf in je
            oefensessies langs.
          </p>
          <div className={classes.closingActivation}>
            <ActivationGate lessonId={meta.id} />
          </div>
          <div className={classes.closingActions}>
            <PracticeActions lessonId={meta.id} />
          </div>
        </div>
      </section>
    </article>
  )
}
