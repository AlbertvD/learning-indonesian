// Lesson 14 — Werkwoordsvorm met ME-: Vervolg (De islam in Indonesië) — bespoke reader page.
//
// This is the *continuation* of lesson 13's ME- prefix: where 13 taught ME- on
// verbs and its nasalisation, 14 spreads ME- across five more word classes
// (noun, pronoun, adjective, numeral, locative) and then contrasts it with BER-
// (state vs. action). The grammar is the overwhelming centrepiece — there is no
// dialogue — so the page is built around three grammar movements:
//   1. a word-class INDEX table (the lesson's own overview), the spine
//   2. the six word-class transform groups (aku → mengaku, dua → mendua, …)
//   3. a dedicated BER-/ME- "state | action" contrast track — the theatrical heart
// The Islam-in-Indonesië reading opens as a collapsed culture spread.
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 14 --pretty > src/pages/lessons/lesson-14/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules?: string[]; examples?: Example[]; table?: string[][] }

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

// ─── A transform example: split "base → derived" + a separate sentence example ─
// The grammar examples interleave (a) base→derived pairs and (b) full sentences.
// Pairs contain "→"; sentences don't. We render them differently.

function isPair(ex: Example) {
  return ex.indonesian.includes('→')
}

function TransformPair({ ex }: { ex: Example }) {
  const [base, derived] = ex.indonesian.split('→').map(s => s.trim())
  return (
    <div className={classes.transform}>
      <span className={classes.transformBase}>{base}</span>
      <span className={classes.transformArrow}>→</span>
      <span className={classes.transformDerived}>{derived}</span>
      <PlayButton src={ex.audioUrl} />
      <span className={classes.transformNl}>{ex.dutch}</span>
    </div>
  )
}

function SentenceExample({ ex }: { ex: Example }) {
  return (
    <div className={classes.sentenceExample}>
      <div className={classes.sentenceExampleId}>
        <span>{ex.indonesian}</span>
        <PlayButton src={ex.audioUrl} />
      </div>
      <div className={classes.sentenceExampleNl}>{ex.dutch}</div>
    </div>
  )
}

// ─── Grammar movement 1: the word-class index table (the lesson's spine) ─────

function WordClassIndex({ cat }: { cat: GrammarCategory }) {
  if (!cat.table) return null
  const [head, ...rows] = cat.table
  return (
    <div className={classes.indexBlock}>
      <p className={classes.indexCaption}>Eén voorvoegsel, zes woordklassen — dit is de kaart van de hele les.</p>
      <table className={classes.indexTable}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} data-col={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} data-active={row[1]?.includes('14')}>
              {row.map((cell, j) => (
                <td key={j} data-col={j}>
                  {j === 2 ? <span className={classes.indexTag} data-use={cell}>{cell}</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Grammar movement 2: a word-class transform group ────────────────────────

function WordClassGroup({ cat, accent, label }: { cat: GrammarCategory; accent: string; label: string }) {
  const pairs = (cat.examples ?? []).filter(isPair)
  const sentences = (cat.examples ?? []).filter(ex => !isPair(ex))
  return (
    <article className={classes.classTile} data-accent={accent}>
      <header className={classes.classHeader}>
        <span className={classes.classLabel}>{label}</span>
        <h3 className={classes.classTitle}>{cat.title}</h3>
      </header>
      {cat.rules && cat.rules.length > 0 && (
        <ul className={classes.classRules}>
          {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
      )}
      {(pairs.length > 0 || sentences.length > 0) && (
        <div className={classes.classExamples}>
          {pairs.length > 0 && (
            <div className={classes.transformGrid}>
              {pairs.map((ex, j) => <TransformPair key={j} ex={ex} />)}
            </div>
          )}
          {sentences.length > 0 && (
            <div className={classes.sentenceGrid}>
              {sentences.map((ex, j) => <SentenceExample key={j} ex={ex} />)}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Grammar movement 3: the BER-/ME- contrast track ─────────────────────────
// The lesson's pedagogical climax: BER- = state, ME- = action. We pair the
// example sentences into a left (BER-, static) / right (ME-, dynamic) split so
// the contrast is *visible*, not just stated. The pairs ride down the section.

function classifyForm(indonesian: string): 'ber' | 'me' | null {
  // Find the first ber-/me- prefixed token in the sentence.
  const m = indonesian.match(/\b(ber\w+|me\w+)\b/i)
  if (!m) return null
  return m[1].toLowerCase().startsWith('ber') ? 'ber' : 'me'
}

function ContrastTrack({ cat }: { cat: GrammarCategory }) {
  // Walk the sentence examples and pair consecutive BER-/ME- sentences.
  const sentences = (cat.examples ?? []).filter(ex => !isPair(ex))
  const pairs: Array<{ ber?: Example; me?: Example }> = []
  let current: { ber?: Example; me?: Example } = {}
  for (const ex of sentences) {
    const form = classifyForm(ex.indonesian)
    if (form === 'ber') {
      if (current.ber || current.me) { pairs.push(current); current = {} }
      current.ber = ex
    } else if (form === 'me') {
      current.me = ex
      pairs.push(current)
      current = {}
    } else {
      if (current.ber || current.me) { pairs.push(current); current = {} }
      current.ber = ex // unclassifiable → park on the left
    }
  }
  if (current.ber || current.me) pairs.push(current)

  const headPairs = (cat.examples ?? []).filter(isPair)

  return (
    <article className={classes.contrastTile}>
      <h3 className={classes.contrastTitle}>{cat.title}</h3>
      {cat.rules && (
        <ul className={classes.classRules}>
          {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
      )}

      {headPairs.length > 0 && (
        <div className={classes.transformGrid} data-contrast="true">
          {headPairs.map((ex, j) => {
            // These pairs read "dekat → berdekat / mendekat" — keep both meng-forms.
            const [base, derived] = ex.indonesian.split('→').map(s => s.trim())
            return (
              <div key={j} className={classes.transform}>
                <span className={classes.transformBase}>{base}</span>
                <span className={classes.transformArrow}>→</span>
                <span className={classes.transformDerived}>{derived}</span>
                <PlayButton src={ex.audioUrl} />
                <span className={classes.transformNl}>{ex.dutch}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className={classes.contrastLegend}>
        <span className={classes.contrastChip} data-form="ber">BER- · toestand</span>
        <span className={classes.contrastChip} data-form="me">ME- · handeling</span>
      </div>
      <div className={classes.contrastGrid}>
        {pairs.map((p, j) => (
          <div key={j} className={classes.contrastRow}>
            <div className={classes.contrastCell} data-form="ber">
              {p.ber ? (
                <>
                  <div className={classes.contrastId}><span>{p.ber.indonesian}</span><PlayButton src={p.ber.audioUrl} /></div>
                  <div className={classes.contrastNl}>{p.ber.dutch}</div>
                </>
              ) : <span className={classes.contrastEmpty} aria-hidden>—</span>}
            </div>
            <div className={classes.contrastVs} aria-hidden>↔</div>
            <div className={classes.contrastCell} data-form="me">
              {p.me ? (
                <>
                  <div className={classes.contrastId}><span>{p.me.indonesian}</span><PlayButton src={p.me.audioUrl} /></div>
                  <div className={classes.contrastNl}>{p.me.dutch}</div>
                </>
              ) : <span className={classes.contrastEmpty} aria-hidden>—</span>}
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

// ─── Grammar section composition ─────────────────────────────────────────────

const CLASS_ACCENTS = ['cyan', 'purple', 'teal', 'amber', 'green', 'rose'] as const
// The six word-class transform groups, with a short editorial label each.
const CLASS_LABELS = [
  'Zelfst. nw · met lijdend voorwerp',
  'Zelfst. nw · zonder lijdend voorwerp',
  'Persoonlijk voornaamwoord',
  'Bijvoeglijk naamwoord',
  'Telwoord',
  'Woord van plaats',
]

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const cats = c.categories
  // 0 = concept intro, 1 = index table, 2..8 = six word-class groups,
  // 9 = BER/ME relation intro, 10 = BER/ME verb+noun, 11 = BER/ME adj+numeral.
  const concept = cats[0]
  const index = cats[1]
  const groups = cats.slice(2, 8)
  const relationIntro = cats[8]
  const contrastVerb = cats[9]
  const contrastAdj = cats[10]

  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · ME- vervolg</p>
      <h2 id="s-gram" className={classes.sectionTitle}>ME- buiten het werkwoord</h2>

      {/* Concept — what ME- does beyond verbs */}
      {concept && (
        <div className={classes.conceptBlock}>
          <h3 className={classes.conceptTitle}>{concept.title}</h3>
          <ul className={classes.classRules}>
            {(concept.rules ?? []).map((r, j) => <li key={j}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Movement 1 — the word-class index */}
      {index && <WordClassIndex cat={index} />}

      {/* Movement 2 — six word-class transform groups */}
      <p className={classes.movementCaption}>Per woordklasse: het basiswoord, en wat ME- ervan maakt.</p>
      <div className={classes.classGrid}>
        {groups.map((cat, i) => (
          <WordClassGroup
            key={i}
            cat={cat}
            accent={CLASS_ACCENTS[i % CLASS_ACCENTS.length]}
            label={CLASS_LABELS[i] ?? `${i + 1}`}
          />
        ))}
      </div>

      {/* Movement 3 — the BER-/ME- contrast */}
      <div className={classes.contrastIntro}>
        <p className={classes.contrastEyebrow}>BER- ↔ ME-</p>
        <h3 className={classes.contrastSectionTitle}>Toestand tegenover handeling</h3>
        {relationIntro?.rules && (
          <ul className={classes.classRules}>
            {relationIntro.rules.map((r, j) => <li key={j}>{r}</li>)}
          </ul>
        )}
      </div>
      <div className={classes.contrastStack}>
        {contrastVerb && <ContrastTrack cat={contrastVerb} />}
        {contrastAdj && <ContrastTrack cat={contrastAdj} />}
      </div>
    </section>
  )
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

function Vocabulary({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Zesenveertig nieuwe woorden</h2>

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

// ─── Culture essay — Islam in Indonesië (collapsible) ────────────────────────

function CultureEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [open, setOpen] = useState(false)
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <p className={classes.cultureEyebrow}>Achtergrond · Geloof</p>
      <h2 id="s-culture" className={classes.sectionTitle}>De islam in Indonesië</h2>
      <p className={classes.cultureDek}>
        Van natuurgeloof en hindoeïsme naar de grootste islamitische gemeenschap ter wereld — en hoe beter onderwijs het denken over geloof veranderde.
      </p>

      <div className={classes.cultureBody} data-open={open}>
        {c.paragraphs.map((p, i) => (
          <p key={i} className={classes.culturePara} data-lead={i === 0}>{p}</p>
        ))}
        {!open && <div className={classes.cultureFade} aria-hidden="true" />}
      </div>

      <button type="button" className={classes.cultureToggle} onClick={() => setOpen(o => !o)}>
        {open ? 'Inkorten' : 'Lees het hele stuk'}
      </button>
    </section>
  )
}

// ─── Page composition ──────────────────────────────────────────────────────

export default function Lesson14Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero band — full-bleed, decorated */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>ME-, vervolg</span>
              <span className={classes.heroTitleNl}>Het voorvoegsel buiten het werkwoord</span>
            </h1>
            <p className={classes.heroDescription}>
              Les 13 zette ME- op werkwoorden. Nu gaat hetzelfde voorvoegsel los op vijf andere woordklassen — een zelfstandig naamwoord, een telwoord, zelfs <em>aku</em> — en komt het tegenover BER- te staan: toestand tegenover handeling.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — sets the page's voice */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            <em>dua</em> is twee. <em>mendua</em> is uiteenvallen in tweeën. Hetzelfde voorvoegsel dat een werkwoord maakt, maakt nu een telwoord, een kleur en een plaats tot een handeling. En naast ME- staat altijd BER- — de stille tegenpool.
          </p>
          <p className={classes.ledeMeta}>Les 14 · A1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — band between the lede and the main content */}
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
          <GrammarSection section={sections[2]} />
          <Vocabulary     section={sections[1]} />
          <CultureEssay   section={sections[0]} />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA grouped as one unit */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de ME-vormen, de woorden en de BER-/ME-contrasten verschijnen automatisch in je oefensessies.
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
