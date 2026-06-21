// Lesson 16 — Di Kantor Pos (Op het postkantoor) — bespoke reader page.
//
// Two engines drive this lesson. At the counter, Ibu Rusli buys stamps for the
// Netherlands and sends a sea-mail parcel — a forms-and-weighing errand thick
// with passive verbs ("dit formulier moet eerst ingevuld worden", "hij moet
// gewogen worden"). In the grammar, those exact passives get named: the DI-form.
// So the page is built around ONE move — the active→passive FLIP, where the
// patiens (the thing handled) overtakes the agens (the doer) and moves to the
// front. The grammar leads, rendered as a "schakelbord": the flip stated as a
// transform, then four accent-coded rule-tiles with aligned example grids.
// Below it the postal dialogue plays out the flip in the wild, then the parcel-
// counter vocabulary, then a long Dutch CULTUUR essay on the founding of the
// Republic up to 1965 (Pancasila → Soekarno → 1965) — opens collapsed, drop-cap,
// long measure. A cool ink-blue + stamp-red palette (postmark on airmail paper).
//
// Re-roll by re-running:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/fetch-lesson-content.ts 16 --pretty > src/pages/lessons/lesson-16/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type Example = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: Example[] }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }

const meta = content.meta
const sections = content.sections

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

// ─── Grammar opener: the active → passive FLIP ────────────────────────────────
// The first DI-category carries paired examples — an active ME-sentence and its
// passive DI-counterpart. We render them as a transform: the active sentence on
// top, the passive (DI) underneath, joined by a flip glyph. The patiens shifting
// to the front is the whole point, so we give the passive line the accent colour.

function FlipBoard({ cat }: { cat: GrammarCategory }) {
  // examples alternate active / passive: [act, pas, act, pas, …]
  const pairs: [Example, Example][] = []
  for (let i = 0; i + 1 < cat.examples.length; i += 2) {
    pairs.push([cat.examples[i], cat.examples[i + 1]])
  }
  return (
    <div className={classes.flipBlock}>
      <ul className={classes.flipRules}>
        {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
      </ul>
      <div className={classes.flipGrid}>
        {pairs.map(([act, pas], i) => (
          <div key={i} className={classes.flipPair}>
            <div className={classes.flipRow} data-voice="active">
              <span className={classes.flipTag}>actief</span>
              <span className={classes.flipId}>{act.indonesian}<PlayButton src={act.audioUrl} /></span>
              <span className={classes.flipNl}>{act.dutch.replace(/\s*\([^)]*\)\s*$/, '')}</span>
            </div>
            <div className={classes.flipArrowRow} aria-hidden="true"><span className={classes.flipArrow}>↓</span></div>
            <div className={classes.flipRow} data-voice="passive">
              <span className={classes.flipTag}>DI-vorm</span>
              <span className={classes.flipId}>{pas.indonesian}<PlayButton src={pas.audioUrl} /></span>
              <span className={classes.flipNl}>{pas.dutch.replace(/\s*\([^)]*\)\s*$/, '')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Grammar rule-tile (categories 2-5): rules + aligned example grid ─────────
// Each accented tile: rules as → bullets, then a 3-track example grid
// (indonesian → dutch) under a dashed rule, base term right-aligned so the
// arrows and translations line up down the column.

const TILE_ACCENTS = ['red', 'cyan', 'teal', 'purple'] as const

function RuleTile({ cat, index, accent }: { cat: GrammarCategory; index: number; accent: string }) {
  return (
    <article className={classes.tile} data-accent={accent}>
      <header className={classes.tileHeader}>
        <span className={classes.tileNumber}>{`0${index}`}</span>
        <h3 className={classes.tileTitle}>{cat.title}</h3>
      </header>
      <div className={classes.tileBody}>
        <ul className={classes.tileRules}>
          {cat.rules.map((r, j) => <li key={j}>{r}</li>)}
        </ul>
        {cat.examples.length > 0 && (
          <div className={classes.tileExamples}>
            {cat.examples.map((ex, j) => (
              <div key={j} className={classes.exPair}>
                <span className={classes.exId}>{ex.indonesian}<PlayButton src={ex.audioUrl} /></span>
                <span className={classes.exArrow} aria-hidden="true">→</span>
                <span className={classes.exNl}>{ex.dutch.replace(/\s*\([^)]*\)\s*$/, '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function GrammarSection({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const [opener, ...tiles] = c.categories
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · De DI-vorm</p>
      <h2 id="s-gram" className={classes.sectionTitle}>De lijdende vorm: het lijdend voorwerp naar voren</h2>
      <p className={classes.grammarDek}>
        In het Indonesisch staat vaak niet de dóéner vooraan, maar de zaak die de handeling <em>ondergaat</em>.
        Wie een actieve ME-zin omdraait naar een passieve DI-zin, laat de patiens naar voren schuiven — en plakt
        <strong> di-</strong> aan het werkwoord.
      </p>

      {/* The flip — active ⇆ passive, the heart of the lesson */}
      {opener && <FlipBoard cat={opener} />}

      {/* The four rule tiles: word order, oleh/preference, transitivity, di-attachment */}
      <div className={classes.tiles}>
        {tiles.map((cat, i) => (
          <RuleTile key={i} cat={cat} index={i + 2} accent={TILE_ACCENTS[(i + 1) % TILE_ACCENTS.length]} />
        ))}
      </div>
    </section>
  )
}

// ─── Dialogue — at the post-office counter ────────────────────────────────────
// Three voices: Ibu Rusli (customer), Pak Bakri (stamp clerk), Dik Wiwi (parcel
// clerk). Speaker-coloured labels, no line stripes.

function speakerTone(speaker: string): 'ibu' | 'bakri' | 'wiwi' {
  const s = speaker.toLowerCase()
  if (s.includes('rusli') || s.includes('ibu')) return 'ibu'
  if (s.includes('bakri')) return 'bakri'
  return 'wiwi'
}

function DialogueScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { setup?: string; lines: DialogueLine[] }
  return (
    <section className={classes.section} aria-labelledby="s-dial">
      <div className={classes.dialogueBand}>
        <p className={classes.dialogueEyebrow}>Dialoog · Aan het loket</p>
        <h2 id="s-dial" className={classes.sectionTitle}>Di Kantor Pos</h2>
        <p className={classes.dialogueSetup}>
          Ibu Rusli koopt postzegels voor een ansichtkaart en een brief naar Nederland, verstuurt daarna een
          zeepostpakket vol boeken en stof — formulier, douaneverklaring, weegschaal — en vraagt ten slotte naar
          het filatelieloket voor haar kind dat postzegels verzamelt.
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

// ─── Vocabulary — the post office & beyond ────────────────────────────────────

function Vocabulary({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · Het postkantoor</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>Postzegels, pakketten en de woorden eromheen</h2>

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

// ─── Culture essay — the founding of the Republic, to 1965 (collapsible) ──────

function CultureEssay({ section }: { section: typeof sections[number] }) {
  const c = section.content as { paragraphs: string[] }
  const [open, setOpen] = useState(false)
  return (
    <section className={classes.section} aria-labelledby="s-culture">
      <p className={classes.cultureEyebrow}>Achtergrond · Cultuur</p>
      <h2 id="s-culture" className={classes.sectionTitle}>Eenheid in verscheidenheid — de jonge Republiek</h2>
      <p className={classes.cultureDek}>
        Bhinneka Tunggal Ika — &lsquo;Eenheid in Verscheidenheid&rsquo;. Van de vijf principes van de Pancasila en
        de proclamatie van 17 augustus 1945, via een bloedige onafhankelijkheidsoorlog met Nederland, naar de
        Soekarno-jaren en het kantelpunt van 1965.
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

// ─── Page composition ─────────────────────────────────────────────────────────

export default function Lesson16Page() {
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
              <span className={classes.heroTitleId}>Di Kantor Pos</span>
              <span className={classes.heroTitleNl}>Op het postkantoor — en de lijdende vorm</span>
            </h1>
            <p className={classes.heroDescription}>
              Ibu Rusli koopt postzegels voor Nederland en verstuurt een zeepostpakket. Aan het loket hoort ze
              de passieve vorm overal: <em>dit formulier moet eerst ingevuld worden</em>, <em>hij moet gewogen worden</em>.
              Precies die vorm krijgt hier een naam — de DI-vorm.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede — sets the page's voice */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            <em>Dia mengirim paket pos</em> — zij stuurt een pakket. Draai het om en het pakket neemt de hoofdrol over:
            <em> paket pos dikirimnya</em>. Niet de doener, maar de zaak die de handeling ondergaat, staat nu vooraan.
          </p>
          <p className={classes.ledeMeta}>Les 16 · B1 · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — band between the lede and the main content */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} voice={meta.primary_voice ?? undefined} />
          </div>
        </section>
      )}

      {/* Main content — single column, aligned to lede width */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <GrammarSection  section={sections[3]} />
          <DialogueScene   section={sections[1]} />
          <Vocabulary      section={sections[2]} />
          <CultureEssay    section={sections[0]} />
        </main>
      </section>

      {/* Closing band — outro + activation + CTA grouped as one unit */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de DI-vormen, de woordenschat van het postkantoor en de zinnen verschijnen
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
