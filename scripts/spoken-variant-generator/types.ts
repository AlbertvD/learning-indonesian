/**
 * Types for the spoken variant generator pipeline stage.
 */

/** A single line from the verified transcript */
export interface TranscriptLine {
  /** 1-based line number in source file */
  lineNumber: number
  /** Original text (empty string for blank lines) */
  text: string
}

/** A transformation applied to convert formal → spoken */
export interface StyleDecision {
  /** 1-based line number in source */
  lineNumber: number
  /** The original text */
  original: string
  /** What changed */
  transformations: Transformation[]
}

export interface Transformation {
  /** Rule that triggered this change */
  rule: string
  /** What was matched */
  from: string
  /** What it became */
  to: string
  /** Which track: learner, natural, or both */
  track: 'learner' | 'natural' | 'both'
}

/** Output tracks */
export interface SpokenOutput {
  learnerSpoken: string[]
  naturalSpoken: string[]
  styleDecisions: StyleDecision[]
}

/** Stage status */
export interface StageStatus {
  stage: '40_spoken'
  status: 'complete' | 'error'
  timestamp: string
  sourceFile: string
  outputFiles: string[]
  stats: {
    totalLines: number
    transformedLines: number
    learnerTransformations: number
    naturalTransformations: number
  }
  error?: string
}
