// lib/exercise-content/byKind/dialogueLine — dialogue_line-source-kind fetcher.
//
// Artifacts-only fetch: no learning_items join. The three required artifacts
// (cloze_context, cloze_answer, translation:l1) are written by the publish
// pipeline at scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts.
// The RawProjectorInput has learningItem=null and dialogueLine populated;
// the byType cloze packager branches on which field is set.
//
// cloze_mcq remains item-only (its distractor pool is lesson-anchored and
// extending it to dialogue_line is a follow-up). dialogue_line blocks
// scheduled with exerciseType=cloze_mcq would be a planner bug —
// defensively we still emit them with their artifacts, but the projector
// will reject the input shape with item_not_found.
//
// Extracted from ../adapter.ts in PR 0 of
// docs/plans/2026-05-21-affixed-form-pair-runtime.md.

import type { ArtifactKind, CapabilityArtifact } from '@/lib/capabilities'
import {
  type DialogueLineBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  fetchArtifacts,
  makeFailContext,
} from '../adapter'

export async function fetchForDialogueLineBlocks(
  client: SupabaseSchemaClient,
  dialogueBlocks: DialogueLineBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (dialogueBlocks.length === 0) return

  const capabilityIds = [...new Set(dialogueBlocks.map(b => b.block.capabilityId))]
  const artifactRows = await fetchArtifacts(client, capabilityIds)

  // Index artifacts by capability_id → Map<kind, artifact>. Same shape as
  // the item bucket so the resolver gets a uniform artifactsByKind map.
  const artifactsByCapability = new Map<string, Map<ArtifactKind, CapabilityArtifact>>()
  for (const row of artifactRows) {
    const inner = artifactsByCapability.get(row.capability_id) ?? new Map<ArtifactKind, CapabilityArtifact>()
    inner.set(row.artifact_kind, {
      qualityStatus: 'approved',
      value: row.artifact_json,
    })
    artifactsByCapability.set(row.capability_id, inner)
  }

  for (const { block, sourceRef } of dialogueBlocks) {
    const artifactsByKind = artifactsByCapability.get(block.capabilityId) ?? new Map<ArtifactKind, CapabilityArtifact>()
    const clozeContextArtifact = artifactsByKind.get('cloze_context')
    const clozeAnswerArtifact = artifactsByKind.get('cloze_answer')
    const translationArtifact = artifactsByKind.get('translation:l1')

    const missing: string[] = []
    if (!clozeContextArtifact) missing.push('cloze_context')
    if (!clozeAnswerArtifact) missing.push('cloze_answer')
    if (!translationArtifact) missing.push('translation:l1')
    if (missing.length > 0) {
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'dialogue_line_artifact_missing',
          `dialogue_line cap ${block.capabilityId} is missing artifacts: ${missing.join(', ')}`,
          { capabilityId: block.capabilityId, sourceRef, missing }),
      })
      continue
    }

    // Payload shapes are written by projectDialogueArtifacts:
    //   cloze_context.value = { source_text, line_text, speaker, source_ref }
    //   cloze_answer.value  = { value: '<word>' }
    //   translation:l1.value = { value: '<NL line>' }
    const ctxPayload = clozeContextArtifact!.value as {
      source_text?: unknown; line_text?: unknown; speaker?: unknown; source_ref?: unknown
    }
    const answerPayload = clozeAnswerArtifact!.value as { value?: unknown }
    const translationPayload = translationArtifact!.value as { value?: unknown }

    const sourceText = typeof ctxPayload?.source_text === 'string' ? ctxPayload.source_text : ''
    const lineText = typeof ctxPayload?.line_text === 'string' ? ctxPayload.line_text : ''
    const speaker = typeof ctxPayload?.speaker === 'string' ? ctxPayload.speaker : null
    const targetWord = typeof answerPayload?.value === 'string' ? answerPayload.value : ''
    const translation = typeof translationPayload?.value === 'string' ? translationPayload.value : ''

    if (!sourceText || !lineText || !targetWord || !translation) {
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'dialogue_line_artifact_missing',
          `dialogue_line cap ${block.capabilityId} artifacts have empty/malformed payloads`,
          {
            capabilityId: block.capabilityId,
            sourceRef,
            hasSourceText: !!sourceText,
            hasLineText: !!lineText,
            hasTargetWord: !!targetWord,
            hasTranslation: !!translation,
          }),
      })
      continue
    }

    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem: null,
        dialogueLine: { text: lineText, speaker, sourceRef, targetWord, translation, sourceText },
        meanings: [],
        contexts: [],
        answerVariants: [],
        variant: null,
        artifactsByKind,
        poolItems: [],
        poolMeaningsByItem: new Map(),
        userLanguage,
      },
    })
  }
}
