/**
 * capability-stage — public barrel.
 *
 * Stage B of the publish pipeline. Reads lesson content from DB (no
 * staging-file reads), invokes authoring agents to produce vocabulary,
 * grammar, cloze, and morphology rows, projects them to capability /
 * content_unit / artifact tables, and verifies the result via three seed
 * hooks (countParity, contentNonEmpty, seedIntegrity).
 */

export { runCapabilityStage } from './runner'
export type {
  CapabilityStageInput,
  CapabilityStageOutput,
  CapabilityStageCounts,
  ValidationFinding,
  CapabilityGate,
} from './model'
export { CAPABILITY_GATES, EMPTY_COUNTS } from './model'
export { buildLintStagingCommand } from './runner'
