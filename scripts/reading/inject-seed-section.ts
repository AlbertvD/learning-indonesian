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
// Idempotent replace: a previous injection is always the LAST section (this
// script inserts right before the array close), so splice it out first.
const startMarker = `,\n    {\n      "title": ${JSON.stringify(TITLE)}`
const existingIdx = src.indexOf(startMarker)
if (existingIdx !== -1) {
  const endMarker = '\n  ]\n}'
  const endIdx = src.indexOf(endMarker, existingIdx)
  if (endIdx === -1) throw new Error(`Found an existing "${TITLE}" section but not the sections-array close`)
  const span = src.slice(existingIdx, endIdx)
  const titleCount = (span.match(/"title":/g) ?? []).length
  if (titleCount !== 1) {
    throw new Error(`Existing "${TITLE}" section is not the last section (${titleCount} sections in span) — remove it by hand`)
  }
  src = src.slice(0, existingIdx) + src.slice(endIdx)
  console.log(`Replacing existing "${TITLE}" section`)
}
// Insert before the sections-array close. The file ends with the last section's
// `    }` then `  ]` (sections) then `}` (lesson). Add a comma + the new section.
const marker = '\n    }\n  ]\n}'
const idx = src.lastIndexOf(marker)
if (idx === -1) throw new Error('Could not find the sections-array close in lesson.ts')
src = src.slice(0, idx) + '\n    },\n' + section + '\n  ]\n}' + src.slice(idx + marker.length)
writeFileSync(`${DIR}/lesson.ts`, src)
console.log(`Injected "${TITLE}" (${seed.items.length} items) into ${DIR}/lesson.ts`)
