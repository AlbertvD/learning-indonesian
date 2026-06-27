// Level-graded narration pacing for Story podcasts.
//
// Maps a CEFR level onto the existing SSML builder's (variant, speed) axes
// (ssml-builder.ts): the `learner` variant uses longer inter-sentence pauses,
// `natural` shorter ones; `speed` is the prosody rate. Research bake: slower
// rate + longer pauses at A1/A2, natural at B1/B2 (CONTEXT.md → Story podcast).

export type Level = 'A1' | 'A2' | 'B1' | 'B2'

export interface Pacing {
  variant: 'learner' | 'natural'
  speed: number
}

const PACING: Record<Level, Pacing> = {
  A1: { variant: 'learner', speed: 0.85 },
  A2: { variant: 'learner', speed: 0.92 },
  B1: { variant: 'natural', speed: 1 },
  B2: { variant: 'natural', speed: 1 },
}

export function levelToPacing(level: Level): Pacing {
  return PACING[level]
}
