// src/components/dashboard/sessionPreview.ts — pure summarizer for the Home
// "Vandaag" panel (desktop program slice 3): turns a SessionPlan's blocks into
// the four-way count partition the panel renders. Pure function, no I/O — the
// buildSession call itself happens in Dashboard.tsx.
//
// The four categories PARTITION the total (each block counts once):
// listening first (audio-modality capabilities), then grammar (pattern
// capabilities that aren't audio), and everything else falls to reviews / new
// by its block kind. So "12 herhalingen · 6 nieuw · 4 grammatica · 2 luisteren"
// always sums to the total.

export interface SessionPreviewBlock {
  kind: 'due_review' | 'new_introduction'
  renderPlan: { capabilityType: string }
}

export interface SessionPreviewCounts {
  total: number
  reviews: number
  newItems: number
  grammar: number
  listening: number
  /** Rough "± N min" estimate (~13s per exercise, minimum 1). Grounded in
   *  measured session timings (185 real sessions, 2026-07-11): ~13s mean /
   *  ~8s median wall-clock per item. The old 25s/item roughly doubled it. */
  estMinutes: number
}

function isListening(capabilityType: string): boolean {
  return capabilityType.endsWith('_from_audio_cap')
}

function isGrammar(capabilityType: string): boolean {
  return capabilityType.includes('grammar_pattern')
}

export function summarizeSessionPlan(blocks: SessionPreviewBlock[]): SessionPreviewCounts {
  let reviews = 0
  let newItems = 0
  let grammar = 0
  let listening = 0

  for (const block of blocks) {
    const type = block.renderPlan.capabilityType
    if (isListening(type)) listening += 1
    else if (isGrammar(type)) grammar += 1
    else if (block.kind === 'due_review') reviews += 1
    else newItems += 1
  }

  const total = blocks.length
  return {
    total,
    reviews,
    newItems,
    grammar,
    listening,
    estMinutes: total === 0 ? 0 : Math.max(1, Math.round((total * 13) / 60)),
  }
}
