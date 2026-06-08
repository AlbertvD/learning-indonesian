// Lesson 9 — Ke Puskesmas / Dukun en Jamu — bespoke reader page.
//
// The lesson is a dialectic. Two systems of healing exist side by side in
// Indonesia, and the textbook deliberately holds them up against each other:
//
//   - PUSKESMAS, the village health post, where the dokter checks Tina's
//     leg after she fell out of a tree — Western medicine in its most
//     accessible form, the rural counter to the city hospital.
//   - The DUKUN, the traditional healer, who treats body and spirit
//     together. The cultuur spread spends most of its ink on him —
//     semangat, taboes, herb mixtures, the inheritance of the gift —
//     not the dokter. The clinical visit lasts thirteen lines; the
//     dukun's worldview takes thirteen paragraphs.
//
// The grammar is the lesson's other spine: the A-B-C order of an
// Indonesian verb cluster (fase + aspect + hoofdwerkwoord) plus a small
// intensifier section. The A-B-C section ships with a literal three-column
// table of word groups — we render it as the centrepiece of the grammar
// band, because that table IS the grammar.
//
// Three vocabulary sections give the lesson its lexical weight: a general
// list, a body-parts atlas (head to toe — the dokter needs to know what
// hurts), and a symptoms-and-medicine grid (the bridge between dokter and
// dukun, where pilek meets jamu).
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 9 --pretty > src/pages/lessons/lesson-9/content.json

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

// ─── Section: Culture spread — the dukun's worldview ──────────────────────
//
// 13 paragraphs in source. We rearrange:
//
//   p0  → drop-cap lede (Western dismissal → modern acceptance)
//   p1  → cost / family-finance paragraph (regular body)
//   p2  → prevention market paragraph
//   pull-quote: "Ziekte van één familielid kan het hele gezin financieel breken"
//   p3  → home remedies (kept tight)
//   p4  → introduces the dukun as alternative
//   p5  → spiritual condition framing
//   ── BREAK: SEMANGAT CALLOUT ──
//   p6  → balance of stoffelijk / niet-stoffelijk
//   p7  → the semangat paragraph itself, called out as a dedicated panel
//   p8  → kwade krachten (kept lyrical)
//   ── BREAK: DUKUN SPECIALISATIES ROW ──
//   p9  → the dukun specialisten paragraph, extracted into a chip strip
//          (bayi / masseur / botbreuken / slangebeten / magie)
//   p10 → how a dukun is trained (regular body)
//   ── BREAK: EIGENSCHAPPEN-LIST ──
//   p11 → the a/b/c/d list, rendered as a numbered grid
//   p12 → closing line (waarom het verschijnsel blijft bestaan)

const DUKUN_SPECIALISATIES = [
  { id: 'dukun bayi', nl: 'vroedvrouw' },
  { id: 'tukang pijit', nl: 'masseur' },
  { id: 'patah tulang', nl: 'botbreuken' },
  { id: 'gigitan ular', nl: 'slangebeten' },
  { id: 'jamu', nl: 'kruidenmengsels' },
  { id: 'sihir putih', nl: 'witte magie' },
  { id: 'sihir hitam', nl: 'zwarte magie' },
  { id: 'kerasukan', nl: 'bezetenheid' },
] as const

const DUKUN_EIGENSCHAPPEN = [
  { letter: 'a', title: 'Kruidenkennis', body: 'uitgebreide kennis van geneeskrachtige kruiden en kruidenmengsels (jamu, jejamu)' },
  { letter: 'b', title: 'Bezwerende formules', body: 'het uit het hoofd kunnen reciteren van specifieke formules om een bepaalde ziekte uit te bannen' },
  { letter: 'c', title: 'Psychologisch inzicht', body: 'kunnen lezen wat de patiënt nodig heeft, voorbij wat hij vertelt' },
  { letter: 'd', title: 'Culturele taboes', body: 'kennis van culturele conventies en taboes die met de ziekte worden geassocieerd' },
] as const

function CultureSpread({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const p = c.paragraphs
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <div className={classes.cultureBand}>
        <p className={classes.cultureKicker}>Cultuur · Geneeskunst</p>
        <h2 id="s-culture" className={classes.cultureDisplay}>
          Twee wegen naar genezing,
          <span className={classes.cultureDisplayLine2}>de kruidenvrouw en de dokter werken naast elkaar</span>
        </h2>

        {/* Drop-capped lede */}
        <p className={classes.cultureLede}>{p[0]}</p>

        {/* Cost framing */}
        <p className={classes.cultureBody}>{p[1]}</p>

        {/* Pull-quote pulled from the financial logic of prevention */}
        <blockquote className={classes.culturePull}>
          <span className={classes.culturePullMark}>&ldquo;</span>
          Het voorkomen van ziekte neemt in Indonesië, méér dan in Nederland,
          een belangrijke plaats in
          <span className={classes.culturePullMarkClose}>&rdquo;</span>
        </blockquote>

        {/* Prevention market */}
        <p className={classes.cultureBody}>{p[2]}</p>

        {/* Home remedies → arrival of the dukun */}
        <p className={classes.cultureBody}>{p[3]}</p>
        <p className={classes.cultureBody}>{p[4]}</p>
        <p className={classes.cultureBody}>{p[5]}</p>

        {/* Semangat panel — the lesson's pivotal concept */}
        <div className={classes.semangatPanel}>
          <p className={classes.semangatKicker}>Het kernbegrip</p>
          <h3 className={classes.semangatTerm}>
            <span className={classes.semangatId}>semangat</span>
            <span className={classes.semangatGloss}>de innerlijke kracht — Javaans, persoonlijk, te versterken</span>
          </h3>
          <p className={classes.semangatBody}>{p[6]}</p>
          <p className={classes.semangatBody}>{p[7]}</p>
        </div>

        {/* Kwade krachten as a flowing paragraph */}
        <p className={classes.cultureAside}>{p[8]}</p>

        {/* Dukun specialisten — extract the categories paragraph into a chip strip */}
        <div className={classes.specialisten}>
          <p className={classes.specialistenKicker}>Soorten dukun</p>
          <p className={classes.specialistenIntro}>
            Sommige dukun zijn gespecialiseerd. Een paar van de soorten die je
            in de praktijk tegenkomt — verloskunde, massage, breuken, slangebeten,
            kruiden, magie, bezetenheid:
          </p>
          <ul className={classes.specialistenList}>
            {DUKUN_SPECIALISATIES.map((s, i) => (
              <li key={s.id} className={classes.specialistChip} data-cell={(i % 4) + 1}>
                <span className={classes.specialistKey}>{s.id}</span>
                <span className={classes.specialistGloss}>{s.nl}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* How a dukun is trained */}
        <p className={classes.cultureBody}>{p[10]}</p>

        {/* The a/b/c/d list — render as a numbered grid */}
        <div className={classes.eigenschappen}>
          <p className={classes.eigenschappenHeading}>Wat een dukun bezit</p>
          <ol className={classes.eigenschappenGrid}>
            {DUKUN_EIGENSCHAPPEN.map((e) => (
              <li key={e.letter} className={classes.eigenschap}>
                <span className={classes.eigenschapLetter}>{e.letter}</span>
                <span className={classes.eigenschapTitle}>{e.title}</span>
                <span className={classes.eigenschapBody}>{e.body}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Coda */}
        <p className={classes.cultureCoda}>{p[12]}</p>
      </div>
    </section>
  )
}

// ─── Section: Dialogue — Tina at the PUSKESMAS ────────────────────────────

type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

function speakerTone(speaker: string): 'dokter' | 'tina' | 'ibu' | 'narrator' {
  const s = speaker.toLowerCase()
  if (s.includes('dokter')) return 'dokter'
  if (s.includes('tina')) return 'tina'
  if (s.includes('ibu')) return 'ibu'
  return 'narrator'
}

function speakerLabel(speaker: string): string {
  // The two opening narrator paragraphs share the speaker tag "narrator" —
  // rename them so they read as scene-setting, not as a character voice.
  return speaker.toLowerCase() === 'narrator' ? 'Scène' : speaker
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  // The first two lines are narrator-style setup (PUSKESMAS gloss + Tina's
  // fall). We treat them as a stage description and pull them out of the
  // spoken-line stream.
  const narration = c.lines.filter((l) => l.speaker.toLowerCase() === 'narrator')
  const spoken    = c.lines.filter((l) => l.speaker.toLowerCase() !== 'narrator')

  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Op het volksgezondheidscentrum</p>
        <h2 id="s-dial" className={classes.sectionTitle}>
          Tina is uit een boom gevallen — moeder zet koers naar de PUSKESMAS
        </h2>

        {/* Narration as stage direction */}
        {narration.length > 0 && (
          <div className={classes.dialogueStage}>
            {narration.map((line, i) => (
              <div key={i} className={classes.dialogueStageLine}>
                <div className={classes.dialogueStageIdRow}>
                  <span className={classes.dialogueStageId}>{line.text}</span>
                  <PlayButton src={line.audioUrl} />
                </div>
                <div className={classes.dialogueStageNl}>{line.translation}</div>
              </div>
            ))}
          </div>
        )}

        {/* Spoken consultation */}
        <div className={classes.dialogueLines}>
          {spoken.map((line, i) => (
            <div key={i} className={classes.dialogueLine} data-speaker-tone={speakerTone(line.speaker)}>
              <div className={classes.dialogueSpeaker}>{speakerLabel(line.speaker)}</div>
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

// ─── Section: Grammar I — A·B·C verbal order, the lesson's spine ──────────
//
// The DB section has FOUR categories:
//   0  → general A-B-C rule + 8 examples
//   1  → the WORD-GROUP TABLE (3 columns × 13 rows) — the centrepiece
//   2  → Group A (fase) + 4 examples
//   3  → Group B (aspect) + 4 examples
//   4  → Group C (hoofdwerkwoord) + 4 examples
//
// We render this as: an opener rule + 8 examples, then the table-as-machine,
// then the three groups stacked as a 3-tile coloured spread (red/amber/teal).

type GrammarExample = { indonesian: string; dutch: string; audioUrl?: string }
type GrammarCategory = {
  title: string
  rules?: string[]
  table?: string[][]
  examples?: GrammarExample[]
}

const ABC_GROUP_ACCENT = ['rose', 'amber', 'teal'] as const

function VerbalOrderGrammar({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const opener = c.categories[0]
  const table  = c.categories[1]
  const groups = c.categories.slice(2)

  return (
    <section className={classes.section} aria-labelledby="s-abc">
      <p className={classes.abcEyebrow}>Grammatica · De volgorde A · B · C</p>
      <h2 id="s-abc" className={classes.sectionTitle}>
        Hoe een Indonesisch werkwoord zijn buurman vindt — <em>tidak mau datang</em>
      </h2>
      <p className={classes.abcIntro}>{opener?.rules?.[0]}</p>

      {/* Three pill tags, each labelling one position of the cluster */}
      <div className={classes.abcLegend}>
        <span className={classes.abcSlot} data-slot="a">A · fase</span>
        <span className={classes.abcArrow} aria-hidden="true">→</span>
        <span className={classes.abcSlot} data-slot="b">B · aspect</span>
        <span className={classes.abcArrow} aria-hidden="true">→</span>
        <span className={classes.abcSlot} data-slot="c">C · werkwoord</span>
      </div>

      {/* Opener rule examples */}
      {opener?.examples && opener.examples.length > 0 && (
        <div className={classes.abcExamples}>
          {opener.examples.map((ex, i) => (
            <div key={i} className={classes.abcExample}>
              <div className={classes.abcExampleId}>
                {ex.indonesian}
                <PlayButton src={ex.audioUrl} />
              </div>
              <div className={classes.abcExampleNl}>{ex.dutch}</div>
            </div>
          ))}
        </div>
      )}

      {/* The table — the machine itself */}
      {table?.table && (
        <div className={classes.abcTableWrap}>
          <p className={classes.abcTableHeading}>De woordenmachine — kies een woord uit elke kolom</p>
          <div className={classes.abcTable} role="table">
            <div className={classes.abcTableRow} role="row" data-row="head">
              {table.table[0].map((cell, i) => (
                <span key={i} role="columnheader" className={classes.abcTableHead} data-col={['a', 'b', 'c'][i] ?? 'c'}>
                  {cell}
                </span>
              ))}
            </div>
            {table.table.slice(1).map((row, i) => (
              <div key={i} className={classes.abcTableRow} role="row">
                {row.map((cell, j) => (
                  <span key={j} role="cell" className={classes.abcTableCell} data-col={['a', 'b', 'c'][j] ?? 'c'}>
                    {cell}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className={classes.abcTableFoot}>
            <span>* <strong>tidak</strong> kan vóór <em>akan</em> en <em>bakal</em> staan (<em>tidak akan</em>, <em>tidak bakal</em>).</span>
            <span>** <strong>harus</strong> kan vóór alle andere groep-B-woorden staan (<em>harus bisa</em>, <em>harus mau</em>).</span>
          </p>
        </div>
      )}

      {/* Three groups as stacked tiles */}
      <div className={classes.abcGroups}>
        {groups.map((g, i) => (
          <article key={i} className={classes.abcGroup} data-accent={ABC_GROUP_ACCENT[i % ABC_GROUP_ACCENT.length]}>
            <header className={classes.abcGroupHeader}>
              <span className={classes.abcGroupBadge}>{['A', 'B', 'C'][i]}</span>
              <h3 className={classes.abcGroupTitle}>{g.title}</h3>
            </header>
            <div className={classes.abcGroupBody}>
              {g.rules && g.rules.length > 0 && (
                <ul className={classes.abcGroupRules}>
                  {g.rules.map((r, j) => <li key={j}>{r}</li>)}
                </ul>
              )}
              {g.examples && g.examples.length > 0 && (
                <div className={classes.abcGroupExamples}>
                  {g.examples.map((ex, j) => (
                    <div key={j} className={classes.abcGroupExample}>
                      <div className={classes.abcGroupExampleId}>
                        {ex.indonesian}
                        <PlayButton src={ex.audioUrl} />
                      </div>
                      <div className={classes.abcGroupExampleNl}>{ex.dutch}</div>
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

// ─── Section: Grammar II — Intensiveerders (two-tile spread) ──────────────

function IntensifierGrammar({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  return (
    <section className={classes.section} aria-labelledby="s-int">
      <p className={classes.intEyebrow}>Grammatica · Intensiveerders</p>
      <h2 id="s-int" className={classes.sectionTitle}>
        <em>amat · sangat · sekali · benar · betul</em> — een woordje voor of na
      </h2>
      <p className={classes.intIntro}>
        Indonesisch kent geen Steigerung, geen vergrotende vervoeging — maar wel
        een handvol bijwoorden die een bijvoeglijk naamwoord opdraaien. De helft
        staat ervoor, de andere helft erna; één doet dubbeldienst.
      </p>

      <div className={classes.intTiles}>
        {c.categories.map((cat, i) => (
          <article key={i} className={classes.intTile} data-tile={i === 0 ? 'positie' : 'echt'}>
            <header className={classes.intTileHeader}>
              <span className={classes.intTileBadge}>{i === 0 ? '01' : '02'}</span>
              <h3 className={classes.intTileTitle}>{cat.title}</h3>
            </header>
            <ul className={classes.intRules}>
              {cat.rules?.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {cat.examples && cat.examples.length > 0 && (
              <div className={classes.intExamples}>
                {cat.examples.map((ex, j) => (
                  <div key={j} className={classes.intExample}>
                    <div className={classes.intExampleId}>
                      {ex.indonesian}
                      <PlayButton src={ex.audioUrl} />
                    </div>
                    <div className={classes.intExampleNl}>{ex.dutch}</div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Body-parts atlas ────────────────────────────────────────────
//
// 31 items, head → toe. The dokter needs to know what hurts, so the page
// gives them as a labelled lexicon. We split into head / torso / arms-legs
// to keep the grid readable, mapping the items by content rather than data
// order. Items that don't match a zone slip into "andere".

type Item = { indonesian: string; dutch: string; audioUrl?: string }

const HEAD_NL = new Set([
  'lichaam', 'hoofd', 'hoofdhaar', 'lichaamshaar', 'oog', 'mond', 'kin', 'keel',
  'neus', 'lip', 'voorhoofd', 'oor', 'snor', 'hals',
])
const TORSO_NL = new Set([
  'lever', 'hart', 'maag', 'darmen', 'buik', 'borst(kas)', 'ribben',
])
const LIMBS_NL = new Set([
  'arm', 'been', 'billen', 'hand', 'knie', 'vinger', 'voet', 'nagel', 'teen',
])

function BodyAtlas({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  const head  = c.items.filter((it) => HEAD_NL.has(it.dutch))
  const torso = c.items.filter((it) => TORSO_NL.has(it.dutch))
  const limbs = c.items.filter((it) => LIMBS_NL.has(it.dutch))
  const other = c.items.filter((it) =>
    !HEAD_NL.has(it.dutch) && !TORSO_NL.has(it.dutch) && !LIMBS_NL.has(it.dutch)
  )

  return (
    <section className={classes.section} aria-labelledby="s-body">
      <p className={classes.bodyEyebrow}>Woordenschat · Het menselijk lichaam</p>
      <h2 id="s-body" className={classes.sectionTitle}>
        Van hoofd tot teen — <em>tubuh</em> in {c.items.length} woorden
      </h2>
      <p className={classes.bodyHint}>
        De atlas die de dokter en de dukun delen. Hetzelfde lichaam, dezelfde
        woorden — alleen de behandelingswijze verschilt.
      </p>

      <div className={classes.bodyZones}>
        {[
          { label: 'I · Hoofd', items: head },
          { label: 'II · Romp', items: torso },
          { label: 'III · Ledematen', items: limbs },
          ...(other.length > 0 ? [{ label: 'IV · Overig', items: other }] : []),
        ].map((zone) => (
          <div key={zone.label} className={classes.bodyZone}>
            <p className={classes.bodyZoneLabel}>{zone.label}</p>
            <div className={classes.bodyGrid}>
              {zone.items.map((item, i) => (
                <div key={i} className={classes.bodyEntry}>
                  <PlayButton src={item.audioUrl} />
                  <span className={classes.bodyId}>{item.indonesian}</span>
                  <span className={classes.bodyNl}>{item.dutch}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Section: Symptoms & remedies (the third vocab) ───────────────────────
//
// 22 items, with a built-in dialectic: symptoms (sakit perut, pusing, demam,
// pilek, mual, luka, capèk, lemah, muntah) versus remedies (obat, jamu,
// plèster, pembalut, suntik, minum obat, obat batuk, racun, diét, nafsu
// makan). We sort the items into two columns to make that visible.

const SYMPTOM_KEYS = new Set([
  'sakit perut / mag', 'pusing', 'sakit kepala', 'pilek', 'flu', 'demam', 'mual',
  'muntah', 'luka', 'capèk (na inspanning)', 'lemah',
])

function SymptomsRemedies({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  const symptoms = c.items.filter((it) => SYMPTOM_KEYS.has(it.indonesian))
  const remedies = c.items.filter((it) => !SYMPTOM_KEYS.has(it.indonesian))

  return (
    <section className={classes.section} aria-labelledby="s-clinic">
      <p className={classes.clinicEyebrow}>Woordenschat · Klachten &amp; remedies</p>
      <h2 id="s-clinic" className={classes.sectionTitle}>
        Tussen <em>pilek</em> en <em>jamu</em> — wat de patiënt zegt, en wat de genezer geeft
      </h2>

      <div className={classes.clinicDual}>
        <div className={classes.clinicColumn} data-column="symptoms">
          <p className={classes.clinicColumnLabel}>Klachten · wat doet pijn</p>
          <div className={classes.clinicGrid}>
            {symptoms.map((item, i) => (
              <div key={i} className={classes.clinicEntry} data-side="symptom">
                <div className={classes.clinicIdRow}>
                  <span className={classes.clinicId}>{item.indonesian}</span>
                  <PlayButton src={item.audioUrl} />
                </div>
                <span className={classes.clinicNl}>{item.dutch}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={classes.clinicDivider} aria-hidden="true" />

        <div className={classes.clinicColumn} data-column="remedies">
          <p className={classes.clinicColumnLabel}>Remedies · wat genezing brengt</p>
          <div className={classes.clinicGrid}>
            {remedies.map((item, i) => (
              <div key={i} className={classes.clinicEntry} data-side="remedy">
                <div className={classes.clinicIdRow}>
                  <span className={classes.clinicId}>{item.indonesian}</span>
                  <PlayButton src={item.audioUrl} />
                </div>
                <span className={classes.clinicNl}>{item.dutch}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Section: General vocab (36 items) ────────────────────────────────────

function GeneralVocab({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · Les 9 · {c.items.length} woorden</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>
        Het volledige register — van <em>awas</em> tot <em>telah</em>
      </h2>
      <p className={classes.vocabHint}>
        Alle nieuwe woorden in deze les: de werkwoordstammen, de connectoren,
        het maatschappelijke begrippenkader. Een lijst om naar terug te bladeren.
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

// ─── Section: Expressions (4 items, small showcase) ───────────────────────

function ExpressionsRow({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.expressionsEyebrow}>Uitdrukkingen</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Vaste wendingen uit de spreekkamer</h2>

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

export default function Lesson9Page() {
  const activation = useLessonActivation(meta.id)
  // Section index map (DB order):
  //   0: text — culture (13-paragraph dukun + semangat essay)
  //   1: dialogue (PUSKESMAS visit, 13 lines incl. 2 narrator setups)
  //   2: vocabulary — general (36 items)
  //   3: expressions (4 items)
  //   4: grammar — werkwoordvolgorde A-B-C (with word-group table)
  //   5: grammar — intensiveerders
  //   6: exercises (skipped)
  //   7: vocabulary — body parts (31 items)
  //   8: vocabulary — symptoms & remedies (22 items)
  return (
    <article className={classes.page}>
      {/* Hero — jamu gendong vendor at Kebumen */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Ke Puskesmas / Dukun en Jamu</span>
              <span className={classes.heroTitleNl}>Naar de gezondheidspost — en naar de kruidenvrouw</span>
            </h1>
            <p className={classes.heroDescription}>
              Tina valt uit een boom; haar moeder gaat naar de PUSKESMAS, het
              dorpsgezondheidscentrum. Maar de meeste Indonesiërs lopen
              óók naar de <em>dukun</em>: de traditionele genezer die
              lichaam én geest behandelt, met kruidenmengsels (<em>jamu</em>)
              en bezwerende formules. Twee systemen, één patiënt.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Genezing is in Indonesië <em>tweeledig</em>: een dokter onderzoekt het
            been, een dukun herstelt de <em>semangat</em>. De moderne kliniek en
            de oude kruidenkennis bestaan niet als rivalen maar als
            complementen — en deze les laat ze beide op tafel komen.
          </p>
          <p className={classes.ledeMeta}>Les 9 · A1 · Bahasa Indonesia</p>
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

      {/* Main content — culture spread sets the worldview, then the modern
          encounter (puskesmas), then the lesson's grammatical spine (A·B·C),
          intensifier sub-grammar, the shared body-atlas, the clinical
          column-split, and the closing reference lists. */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <CultureSpread        section={sections[0]} />
          <DialogueScene        section={sections[1]} />
          <VerbalOrderGrammar   section={sections[4]} />
          <IntensifierGrammar   section={sections[5]} />
          <BodyAtlas            section={sections[7]} />
          <SymptomsRemedies     section={sections[8]} />
          <GeneralVocab         section={sections[2]} />
          <ExpressionsRow       section={sections[3]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de medische woorden, de A-B-C-volgorde van
            werkwoorden en de intensiveerders komen vanzelf in je oefensessies langs.
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
