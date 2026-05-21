// lib/exercise-content/resolver — orchestrates SessionBlock[] → render-ready
// ExerciseItems. Pure orchestration; no SQL. The adapter at ./adapter owns
// the I/O seam and the source-kind bucketing dispatch; the byType packagers
// at ./byType own the per-exercise-type packaging.
//
// Flow per resolveBlocks call:
//   1. bucketByDecodedSourceKind classifies each block by source kind;
//      malformed / unsupported-kind blocks become fail contexts here.
//   2. adapter.loadBlockData runs per-bucket fetchers in parallel and
//      returns per-block RawProjectorInput | pre-built fail context.
//   3. Single dispatch loop: ok blocks go to buildForExerciseType (which
//      projects + dispatches to the byType packager); fail blocks pass
//      through unchanged.
//   4. Fire-and-forget log every diagnostic to
//      capability_resolution_failure_events.
//
// Module spec: docs/current-system/modules/exercise-content.md.
// Fold plan: docs/plans/2026-05-21-lib-exercise-content-fold.md.

import type { SessionBlock } from '@/lib/session-builder'
import type {
  CapabilityRenderContext,
  ResolutionDiagnostic,
} from '@/lib/capabilities'
import {
  bucketByDecodedSourceKind,
  createAdapter,
  makeFailContext,
} from './adapter'
import { buildForExerciseType } from './byType'

// ─── Reason codes ───────────────────────────────────────────────────────────
//
// Canonical declaration lives at @/lib/exercises/resolutionReasons to break
// what would otherwise be a circular dependency between this module and
// @/lib/capabilities/renderContracts. Re-exported here for back-compat with
// callers that imported the type from the old service path.

export type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'

// ─── Diagnostic + render context type re-exports ────────────────────────────
//
// Definitions live in src/lib/capabilities/renderContext.ts so that lib
// consumers (session-builder, etc.) don't import them through this module.
// Re-exported here for back-compat.
export type { CapabilityRenderContext, ResolutionDiagnostic }

// ─── Service interface ──────────────────────────────────────────────────────

export interface ResolveOptions {
  userId: string
  userLanguage: 'nl' | 'en'
  sessionId: string
}

export interface CapabilityContentService {
  resolveBlocks(
    blocks: SessionBlock[],
    options: ResolveOptions,
  ): Promise<Map<string, CapabilityRenderContext>>
}

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createCapabilityContentService(client: SupabaseSchemaClient): CapabilityContentService {
  const adapter = createAdapter(client)

  return {
    async resolveBlocks(blocks, options) {
      if (blocks.length === 0) return new Map()

      // Step 1: bucket by source kind. Malformed / unsupported blocks become
      // pre-built fail contexts; these flow straight to the result map.
      const { buckets, failures } = bucketByDecodedSourceKind(blocks)
      const result = new Map<string, CapabilityRenderContext>(failures)

      // Step 2: per-bucket data fetch. Adapter runs per-kind fetchers in
      // parallel; today only the item bucket is populated.
      const blockData = await adapter.loadBlockData(buckets, {
        userLanguage: options.userLanguage,
      })

      // Step 3: per-block dispatch. Adapter-emitted fails pass through; ok
      // blocks go through the projector + byType packager via
      // buildForExerciseType. Builder-side fails are reshaped to fail contexts.
      for (const [blockId, data] of blockData) {
        if (data.kind === 'fail') {
          result.set(blockId, data.context)
          continue
        }
        const built = buildForExerciseType(data.block.renderPlan.exerciseType, data.input)
        if (built.kind === 'ok') {
          result.set(blockId, {
            blockId,
            capabilityId: data.block.capabilityId,
            exerciseItem: built.exerciseItem,
            audibleTexts: built.audibleTexts,
            diagnostic: null,
          })
        } else {
          result.set(blockId, makeFailContext(
            data.block, built.reasonCode, built.message, built.payloadSnapshot,
          ))
        }
      }

      // Step 4: fire-and-forget log every diagnostic.
      for (const ctx of result.values()) {
        if (ctx.diagnostic) void adapter.logResolutionFailure(ctx.diagnostic, {
          userId: options.userId,
          sessionId: options.sessionId,
        })
      }

      return result
    },
  }
}

// ─── Convenience entry point ────────────────────────────────────────────────

async function defaultService(): Promise<CapabilityContentService> {
  const { supabase } = await import('@/lib/supabase')
  return createCapabilityContentService(supabase)
}

/** Convenience entry point used by Session's host page. */
export async function resolveCapabilityBlocks(
  blocks: SessionBlock[],
  options: ResolveOptions,
): Promise<Map<string, CapabilityRenderContext>> {
  const service = await defaultService()
  return service.resolveBlocks(blocks, options)
}
