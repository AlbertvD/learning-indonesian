// Lesson 28 — Bab 12 · Di Kantor (Op kantoor) — bespoke reader page.
//
// Mood: a crisp, modern Indonesian boardroom. The reading is a meeting
// transcript: a narrator sets the scene, then five colleagues debate a stalled
// money transfer around the table. The grammar is the "economie van de taal" —
// one principle of economy refracted into three "wetten van behoud" (laws of
// conservation of subject, tense, and number), rendered as a ledger of laws.
//
// Re-roll by re-running:
//   bun scripts/fetch-lesson-content.ts 28 --pretty > src/pages/lessons/lesson-28/content.json

import { useRef, useState } from 'react'
import { ActivationGate } from '@/components/lessons/ActivationGate'
import { useLessonActivation } from '@/hooks/useLessonActivation'
import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'
import { PracticeActions } from '@/components/lessons/PracticeActions'
import content from './content.json'
import classes from './Page.module.css'

const meta = content.meta
const sections = content.sections

type Item = { dutch: string; indonesian: string; audioUrl?: string }
type DialogueLine = { text: string; speaker: string; translation: string; audioUrl?: string }
type GrammarExample = { dutch: string; indonesian: string; audioUrl?: string }
type GrammarCategory = { title: string; rules: string[]; examples: GrammarExample[] }

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

// ─── 1. Dialogue — the meeting in the Denpasar office ───────────────────────

// The DB ships two narrator lines first (scene-setting prose), then the live
// meeting. The narrator lines become an italic stage prologue; the spoken
// lines become a colour-coded transcript. Each translation carries a
// "Speaker: \"...\"" prefix we strip so the speaker lives only in the label.

const SPEAKER_TONES: Record<string, string> = {
  'pak wija': 'chair',
  'pak oka': 'oka',
  'ibu rai': 'rai',
  sulastri: 'staff',
}

function speakerTone(speaker: string): string {
  return SPEAKER_TONES[speaker.toLowerCase()] ?? 'other'
}

// Strip a leading "Speaker: " and surrounding quotes from the NL translation.
function cleanTranslation(translation: string): string {
  let t = translation.replace(/^[^:]{1,24}:\s*/, '').trim()
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim()
  return t
}

function MeetingScene({ section }: { section: typeof sections[number] }) {
  const c = section.content as { lines: DialogueLine[] }
  const narration = c.lines.filter((l) => l.speaker === 'narrator')
  const spoken = c.lines.filter((l) => l.speaker !== 'narrator')

  return (
    <section className={classes.section} aria-labelledby="s-meeting">
      <p className={classes.meetingEyebrow}>Notulen · Rapat di Kantor</p>
      <h2 id="s-meeting" className={classes.sectionTitle}>Een vergadering in Denpasar</h2>

      {/* Narrator prologue — the brief that opens the file */}
      <div className={classes.brief}>
        {narration.map((line, i) => (
          <div key={i} className={classes.briefPara}>
            <p className={classes.briefId}>
              {line.text}
              <PlayButton src={line.audioUrl} />
            </p>
            <p className={classes.briefNl}>{line.translation}</p>
          </div>
        ))}
      </div>

      {/* The transcript proper */}
      <div className={classes.transcript}>
        {spoken.map((line, i) => (
          <div key={i} className={classes.turn} data-speaker-tone={speakerTone(line.speaker)}>
            <div className={classes.turnSpeaker}>{line.speaker}</div>
            <div className={classes.turnBody}>
              <div className={classes.turnIdRow}>
                <span className={classes.turnId}>{line.text}</span>
                <PlayButton src={line.audioUrl} />
              </div>
              <div className={classes.turnNl}>{cleanTranslation(line.translation)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── 2. Vocabulary — the office lexicon ─────────────────────────────────────

function Lexicon({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  return (
    <section className={classes.section} aria-labelledby="s-vocab">
      <p className={classes.vocabEyebrow}>Woordenschat · Bahasa Kantor</p>
      <h2 id="s-vocab" className={classes.sectionTitle}>De taal van het kantoor</h2>
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

// ─── 3. Expression — the single idiom, given its own moment ─────────────────

function ExpressionBand({ section }: { section: typeof sections[number] }) {
  const c = section.content as { items: Item[] }
  const item = c.items[0]
  if (!item) return null
  return (
    <section className={classes.section} aria-labelledby="s-expr">
      <p className={classes.exprEyebrow}>Uitdrukking · Vergaderen</p>
      <h2 id="s-expr" className={classes.sectionTitle}>Eén formule die elke voorzitter kent</h2>
      <figure className={classes.expr}>
        <div className={classes.exprIdRow}>
          <p className={classes.exprId}>{item.indonesian}</p>
          <PlayButton src={item.audioUrl} />
        </div>
        <figcaption className={classes.exprNl}>{item.dutch}</figcaption>
        <p className={classes.exprGloss}>
          Pak Wija opent er zijn samenvatting mee — <em>ada baiknya saya meringkaskan dulu…</em> Het is
          de beleefde manier om een voorstel te doen zonder iemand te overstemmen.
        </p>
      </figure>
    </section>
  )
}

// ─── 4. Grammar — economy of language, three laws of conservation ───────────

// categories[0] = the overarching principle (economie van de taal);
// categories[1..3] = the three "wetten van behoud" (subject, tense, number).

const LAW_ACCENTS = ['cyan', 'teal', 'amber'] as const

function ConservationLaws({ section }: { section: typeof sections[number] }) {
  const c = section.content as { categories: GrammarCategory[] }
  const principle = c.categories[0]
  const laws = c.categories.slice(1)
  return (
    <section className={classes.section} aria-labelledby="s-gram">
      <p className={classes.grammarEyebrow}>Grammatica · Economie van de taal</p>
      <h2 id="s-gram" className={classes.sectionTitle}>De wetten van behoud</h2>

      {/* The governing principle */}
      <div className={classes.principle}>
        <span className={classes.principleGlyph}>§</span>
        <div className={classes.principleBody}>
          <h3 className={classes.principleTitle}>{principle.title}</h3>
          <ul className={classes.principleRules}>
            {principle.rules.map((r, j) => <li key={j}>{r}</li>)}
          </ul>
        </div>
      </div>

      {/* The three laws — a numbered ledger */}
      <div className={classes.lawList}>
        {laws.map((law, i) => (
          <article key={i} className={classes.law} data-accent={LAW_ACCENTS[i % LAW_ACCENTS.length]}>
            <header className={classes.lawHeader}>
              <span className={classes.lawNumber}>{`0${i + 1}`}</span>
              <h3 className={classes.lawTitle}>{law.title}</h3>
            </header>
            <ul className={classes.lawRules}>
              {law.rules.map((r, j) => <li key={j}>{r}</li>)}
            </ul>
            {law.examples.length > 0 && (
              <div className={classes.lawExamples}>
                {law.examples.map((ex, j) => (
                  <div key={j} className={classes.lawExample}>
                    <div className={classes.lawExampleId}>
                      {ex.indonesian}
                      <PlayButton src={ex.audioUrl} />
                    </div>
                    <div className={classes.lawExampleNl}>{ex.dutch}</div>
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

// ─── Page composition ───────────────────────────────────────────────────────

export default function Lesson28Page() {
  const activation = useLessonActivation(meta.id)
  return (
    <article className={classes.page}>
      {/* Hero — full-bleed, boardroom-toned */}
      <header className={classes.heroBand}>
        <div className={classes.heroInner}>
          <div className={classes.heroLeft}>
            <div className={classes.heroBadgeRow}>
              <span className={classes.heroBadge}>{meta.level}</span>
              <span className={classes.heroBadgeAlt}>Les {meta.order_index}</span>
            </div>
            <h1 className={classes.heroTitle}>
              <span className={classes.heroTitleId}>Di Kantor</span>
              <span className={classes.heroTitleNl}>Op kantoor</span>
            </h1>
            <p className={classes.heroDescription}>
              Pak Ketut Wija is secretaris, niet kantoorhoofd — maar vandaag zit hij de vergadering voor.
              Het filiaal in Singaraja zou openen, alleen is het geld uit Jakarta nog niet aangekomen.
              Rond de tafel wordt overlegd, gewikt en gewogen, en de vergadering uitgesteld.
            </p>
          </div>
        </div>
      </header>

      {/* Editorial lede */}
      <section className={classes.ledeBand}>
        <div className={classes.ledeInner}>
          <p className={classes.ledeQuote}>
            Een vergadering is taal onder druk: kort, helder, geen woord te veel. Het Indonesisch maakt
            daar een deugd van. Het herhaalt <em>niets wat niet herhaald hoeft te worden</em> — onderwerp,
            tijd en getal blijven gelden tot iemand iets nieuws introduceert.
          </p>
          <p className={classes.ledeMeta}>Les 28 · {meta.level} · Bahasa Indonesia</p>
        </div>
      </section>

      {/* Lesson audio — guarded band (lights up when audio is attached) */}
      {meta.lesson_audio_url && (
        <section className={classes.audioBand}>
          <div className={classes.audioInner}>
            <LessonAudioPlayer src={meta.lesson_audio_url} voice={meta.primary_voice ?? undefined} />
          </div>
        </section>
      )}

      {/* Main content */}
      <section className={classes.shellBand}>
        <main className={classes.shell}>
          <MeetingScene     section={sections[0]} />
          <ConservationLaws section={sections[3]} />
          <Lexicon          section={sections[1]} />
          <ExpressionBand   section={sections[2]} />
        </main>
      </section>

      {/* Closing band */}
      <section className={classes.closingBand}>
        <div className={classes.closingInner}>
          <h2 className={classes.closingTitle}>Klaar om te oefenen?</h2>
          <p className={classes.closingLede}>
            Activeer de les en de kantoorwoorden, de uitdrukking en de wetten van behoud verschijnen
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
