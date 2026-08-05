// src/pages/Leenwoorden.tsx
//
// PUBLIC page: every Dutch loanword in Indonesian the product teaches.
//
// Why this exists (docs/marketing/channels.md, inner ring): it is the strongest
// findability asset available. "Nederlandse woorden in het Indonesisch" is a real
// Dutch search with no competition, the content is genuinely useful independent
// of the product, and it is the one thing no competitor can build — the loanwords
// are Dutch, so every course routing through English is structurally unable to
// use them (docs/marketing/positioning.md §1).
//
// It is also the page most likely to be SHARED, which per the same doc is how the
// primary persona actually hears about anything.
//
// Data is a committed static export (src/data/loanwords.json, 173 entries, taken
// from learning_items.loan_source_nl on 2026-08-05) rather than a live query,
// because anon has no read grant on the `indonesian` schema — asserted by
// `make check-supabase` — and that schema also holds learner tables. Opening anon
// reads to serve a marketing page would be the wrong trade. Regenerate with the
// query in the header comment of the JSON's sibling doc when the set changes.
//
// Deliberately reachable without auth, like /privacy and /voorwaarden.

import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import loanwords from '@/data/loanwords.json'
import classes from './Leenwoorden.module.css'

interface Loanword {
  id: string
  nl: string
  gloss: string
}

const ALL = loanwords as Loanword[]

export function Leenwoorden() {
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL
    return ALL.filter(
      w =>
        w.id.toLowerCase().includes(q) ||
        w.nl.toLowerCase().includes(q) ||
        w.gloss.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className={classes.page}>
      <header className={classes.head}>
        <Link to="/" className={classes.back}>
          ← Kamoe Bisa
        </Link>
        <h1 className={classes.title}>
          {ALL.length} Nederlandse woorden die je al in het Indonesisch kent
        </h1>
        <p className={classes.intro}>
          Ruim drie eeuwen gedeelde geschiedenis liet honderden Nederlandse woorden
          achter in het Indonesisch. Sommige zijn nauwelijks veranderd, andere kreeg
          een Indonesisch jasje — maar je herkent ze bijna allemaal meteen. Dat is
          een voorsprong die je alleen als Nederlandstalige hebt: wie Indonesisch
          leert via het Engels, heeft er niets aan.
        </p>
        <p className={classes.intro}>
          Hieronder staan ze allemaal, met de Nederlandse bron en de betekenis.
        </p>
      </header>

      <div className={classes.tools}>
        <label className={classes.searchLabel} htmlFor="loanword-search">
          Zoeken
        </label>
        <input
          id="loanword-search"
          className={classes.search}
          type="search"
          placeholder="bijv. kantoor, kulkas, markt"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className={classes.count}>
          {shown.length} van {ALL.length}
        </span>
      </div>

      <ul className={classes.list}>
        {shown.map(w => (
          <li key={w.id} className={classes.row}>
            <span className={classes.id}>{w.id}</span>
            <span className={classes.from}>
              van <em>{w.nl}</em>
            </span>
            {w.gloss && <span className={classes.gloss}>{w.gloss}</span>}
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className={classes.empty}>Geen woord gevonden. Probeer een ander woord.</p>
      )}

      <section className={classes.cta}>
        <h2>Dit zijn je eerste {ALL.length} woorden.</h2>
        <p>
          Kamoe Bisa bouwt hierop verder: 30 lessen met grammatica, dialogen,
          uitspraak én spreektaal — de taal zoals er thuis gepraat wordt, niet
          alleen de boekentaal. Les 1 t/m 3 zijn gratis.
        </p>
        <Link className={classes.ctaBtn} to="/register">
          Gratis beginnen
        </Link>
      </section>

      <footer className={classes.foot}>
        <Link to="/privacy">Privacy</Link>
        <Link to="/voorwaarden">Voorwaarden</Link>
        <Link to="/restitutie">Restitutie</Link>
      </footer>
    </div>
  )
}
