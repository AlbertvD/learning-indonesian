#!/usr/bin/env bun
/**
 * Splice the reader-residual seed (reading-residual-seed.json) into the Common Words
 * staging unit as a new vocabulary section (reader Phase 2 §5). Idempotent: if a
 * "Leeswoorden (Lezen-corpus)" section already exists it is replaced, so re-running
 * after editing the JSON re-syncs without duplicating. The publish (resolve-or-create
 * on normalized_text) then dedups any word already taught elsewhere.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const DIR = 'scripts/data/staging/lesson-999'
const seed = JSON.parse(readFileSync(`${DIR}/reading-residual-seed.json`, 'utf-8')) as {
  items: Array<{ indonesian: string; dutch: string; english: string }>
}
const TITLE = 'Leeswoorden (Lezen-corpus)'
const itemsJson = seed.items
  .map(i => `          ${JSON.stringify(i)}`)
  .join(',\n')
const section =
`    {
      "title": ${JSON.stringify(TITLE)},
      "order_index": 3,
      "content": {
        "type": "vocabulary",
        "items": [
${itemsJson}
        ]
      }
    }`

let src = readFileSync(`${DIR}/lesson.ts`, 'utf-8')
if (src.includes(JSON.stringify(TITLE))) {
  throw new Error(`Section "${TITLE}" already present — edit/remove it before re-injecting.`)
}
// Insert before the sections-array close. The file ends with the last section's
// `    }` then `  ]` (sections) then `}` (lesson). Add a comma + the new section.
const marker = '\n    }\n  ]\n}'
const idx = src.lastIndexOf(marker)
if (idx === -1) throw new Error('Could not find the sections-array close in lesson.ts')
src = src.slice(0, idx) + '\n    },\n' + section + '\n  ]\n}' + src.slice(idx + marker.length)
writeFileSync(`${DIR}/lesson.ts`, src)
console.log(`Injected "${TITLE}" (${seed.items.length} items) into ${DIR}/lesson.ts`)
