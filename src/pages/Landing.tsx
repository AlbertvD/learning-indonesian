// src/pages/Landing.tsx — public marketing landing page at `/` for logged-out
// visitors (desktop program slice 1, docs/plans/2026-07-03-desktop-program-design.md).
//
// Deliberately outside the page framework and Mantine components: a light-only
// marketing surface with its own layout, shipped as an isolated lazy chunk so
// the app entry bundle does not grow. Copy is NL-primary with EN, chunk-local
// in Landing.copy.ts (i18n.ts is entry-resident — see that file's header); the
// visitor has no profile yet, so the language choice lives in localStorage
// instead of the profile like everywhere else in the app.
//
// Copy-honesty rule (owner, 2026-07-03): all audio is TTS — never claim native
// speakers or human narration; audio is mentioned neutrally where it describes
// a real feature, nowhere else.

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Lang } from '@/lib/i18n'
import { landingCopy } from './Landing.copy'
import classes from './Landing.module.css'

const LANDING_LANG_KEY = 'landing-lang'

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(LANDING_LANG_KEY)
    return stored === 'en' ? 'en' : 'nl'
  } catch {
    return 'nl'
  }
}

function SunMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="6.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="16" y1="2.5" x2="16" y2="6" />
        <line x1="16" y1="26" x2="16" y2="29.5" />
        <line x1="2.5" y1="16" x2="6" y2="16" />
        <line x1="26" y1="16" x2="29.5" y2="16" />
        <line x1="6.4" y1="6.4" x2="8.9" y2="8.9" />
        <line x1="23.1" y1="23.1" x2="25.6" y2="25.6" />
        <line x1="6.4" y1="25.6" x2="8.9" y2="23.1" />
        <line x1="23.1" y1="8.9" x2="25.6" y2="6.4" />
      </g>
    </svg>
  )
}

export function Landing() {
  const [lang, setLang] = useState<Lang>(readStoredLang)
  const [searchParams] = useSearchParams()
  const T = landingCopy[lang]

  // ProtectedRoute bounces logged-out visits here carrying `?next=`; forward it
  // to /login so the learner still lands where they were headed after signing in.
  const next = searchParams.get('next')
  const loginTo =
    next && next.startsWith('/') && !next.startsWith('//')
      ? `/login?next=${encodeURIComponent(next)}`
      : '/login'

  const switchLang = (value: Lang) => {
    setLang(value)
    try {
      localStorage.setItem(LANDING_LANG_KEY, value)
    } catch {
      // private-mode storage failures just lose the preference
    }
  }

  return (
    <div className={classes.landing}>
      <header className={classes.head}>
        <span className={`${classes.wordmark} ${classes.serif}`}>
          <span className={classes.mark}>
            <SunMark />
          </span>
          <span className={classes.name}>Kamoe Bisa</span>
        </span>
        <span className={classes.headActions}>
          <Link className={classes.linkQuiet} to={loginTo}>
            {T.login}
          </Link>
          <Link className={`${classes.btn} ${classes.btnFill}`} to="/register">
            {T.registerCta}
          </Link>
        </span>
      </header>

      <main>
        <section className={classes.hero}>
          <div>
            <span className={classes.heroEyebrow}>{T.heroEyebrow}</span>
            <h1 className={classes.serif}>
              {T.heroTitlePre}
              <br />
              <em>{T.heroTitleEm}</em>.
            </h1>
            <p className={classes.heroSub}>{T.heroSub}</p>
            <div className={classes.heroCtas}>
              <Link className={`${classes.btn} ${classes.btnFill} ${classes.btnLg}`} to="/register">
                {T.heroCta}
              </Link>
              <Link className={classes.linkQuiet} to={loginTo}>
                {T.heroLogin}
              </Link>
            </div>
          </div>

          <div className={classes.deck} role="img" aria-label={T.specAria}>
            <div className={`${classes.deckBack} ${classes.deckBack2}`} />
            <div className={`${classes.deckBack} ${classes.deckBack1}`} />
            <div className={classes.spec} aria-hidden="true">
              <div className={classes.specTop}>
                <span className={classes.specTag}>
                  <i /> {T.specTag}
                </span>
                <span className={classes.specCount}>{T.specNr}</span>
              </div>
              <div className={`${classes.specWord} ${classes.serif}`}>pasar</div>
              <div className={classes.specPhon}>{T.specPhon}</div>
              <div className={classes.specRule} />
              <div className={`${classes.specGloss} ${classes.serif}`}>{T.specGloss}</div>
              <div className={classes.specEx}>
                <span className={classes.id}>{T.specExample}</span>
                <span className={classes.tr}>{T.specExampleTr}</span>
              </div>
              <div className={classes.specFoot}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v4h4" />
                </svg>
                {T.specNext}
              </div>
            </div>
          </div>
        </section>

        <section className={`${classes.section} ${classes.sectionAiry}`}>
          <div className={classes.lead}>
            <span className={classes.leadKicker}>{T.howKicker}</span>
            <h2 className={`${classes.leadTitle} ${classes.serif}`}>{T.howTitle}</h2>
          </div>
          <div className={classes.flow}>
            {(
              [
                ['01', T.how1Title, T.how1Body],
                ['02', T.how2Title, T.how2Body],
                ['03', T.how3Title, T.how3Body],
              ] as const
            ).map(([idx, title, body]) => (
              <div key={idx} className={classes.flowCol}>
                <span className={`${classes.flowIdx} ${classes.serif}`}>{idx}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={classes.section}>
          <div className={classes.lead} style={{ marginBottom: 28 }}>
            <span className={classes.leadKicker}>{T.featKicker}</span>
          </div>
          <div className={classes.grid4}>
            <div className={classes.g4}>
              <span className={classes.g4Ic}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H6a2 2 0 0 0-2 2z" />
                  <path d="M4 20.5A1.5 1.5 0 0 1 5.5 19H19" />
                </svg>
              </span>
              <h3>{T.feat1Title}</h3>
              <p>{T.feat1Body}</p>
            </div>
            <div className={classes.g4}>
              <span className={classes.g4Ic}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
                  <rect x="3" y="14" width="4" height="6" rx="1.5" />
                  <rect x="17" y="14" width="4" height="6" rx="1.5" />
                </svg>
              </span>
              <h3>{T.feat2Title}</h3>
              <p>{T.feat2Body}</p>
            </div>
            <div className={classes.g4}>
              <span className={classes.g4Ic}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v16" />
                  <path d="M6 8h12" />
                  <circle cx="7" cy="15" r="2.4" />
                  <circle cx="17" cy="15" r="2.4" />
                </svg>
              </span>
              <h3>{T.feat3Title}</h3>
              <p>{T.feat3Body}</p>
            </div>
            <div className={classes.g4}>
              <span className={classes.g4Ic}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20V13" />
                  <path d="M10 20V6" />
                  <path d="M16 20v-9" />
                  <path d="M22 20H2" />
                </svg>
              </span>
              <h3>{T.feat4Title}</h3>
              <p>{T.feat4Body}</p>
              <div className={classes.g4Bar} aria-hidden="true">
                <i />
              </div>
              <div className={classes.g4BarCap} aria-hidden="true">
                {T.feat4BarCap}
              </div>
            </div>
          </div>
        </section>

        <section className={classes.invite}>
          <div className={classes.inviteTxt}>
            <div className={classes.inviteEyebrow}>{T.inviteEyebrow}</div>
            <h2 className={classes.serif}>{T.inviteTitle}</h2>
            <p>{T.inviteBody}</p>
          </div>
          <Link className={`${classes.btn} ${classes.btnFill} ${classes.btnLg}`} to="/register">
            {T.heroCta}
          </Link>
        </section>
      </main>

      <footer className={classes.foot}>
        <span>
          © {new Date().getFullYear()} Kamoe Bisa · {T.footerMade}
        </span>
        <span className={classes.footLinks}>
          <Link to="/privacy">{T.footerPrivacy}</Link>
          <span className={classes.langSwitch}>
            <button type="button" aria-pressed={lang === 'nl'} onClick={() => switchLang('nl')}>
              NL
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => switchLang('en')}>
              EN
            </button>
          </span>
        </span>
      </footer>
    </div>
  )
}
