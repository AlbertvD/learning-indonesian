import type { SessionQueueItem } from '@/types/learning'
import type { CapabilityHealthReport, CapabilityReadiness } from '@/lib/capabilities/capabilityContracts'
import type { CapabilityProjection, CapabilityType } from '@/lib/capabilities/capabilityTypes'
import { getStableSessionItemIdentity } from '@/lib/session/sessionItemIdentity'

export interface SessionCapabilityDiagnostic {
  sessionItemId: string
  impliedCapabilityKey?: string
  readiness?: CapabilityReadiness
  severity: 'info' | 'warn' | 'critical'
  message: string
}

export interface SessionCapabilityDiagnosticInput {
  items: SessionQueueItem[]
  projection: CapabilityProjection
  health: CapabilityHealthReport
}

export type SessionCapabilityDiagnosticsProvider = () => Omit<SessionCapabilityDiagnosticInput, 'items'> | null

let diagnosticsProvider: SessionCapabilityDiagnosticsProvider | null = null

export function setSessionCapabilityDiagnosticsProvider(provider: SessionCapabilityDiagnosticsProvider | null): void {
  diagnosticsProvider = provider
}

export function runSessionCapabilityDiagnosticsIfEnabled(input: {
  enabled: boolean
  items: SessionQueueItem[]
}): SessionCapabilityDiagnostic[] {
  if (!input.enabled || !diagnosticsProvider) return []
  const diagnosticInput = diagnosticsProvider()
  if (!diagnosticInput) return []
  return diagnoseSessionItems({
    items: input.items,
    projection: diagnosticInput.projection,
    health: diagnosticInput.health,
  })
}

function capabilityTypeFor(item: SessionQueueItem): CapabilityType | null {
  if (item.exerciseItem.exerciseType === 'meaning_recall') return 'meaning_recall'
  if (item.exerciseItem.exerciseType === 'typed_recall') return 'form_recall'
  if (item.exerciseItem.exerciseType === 'recognition_mcq') return 'text_recognition'
  if (item.exerciseItem.exerciseType === 'listening_mcq') return 'audio_recognition'
  if (item.exerciseItem.exerciseType === 'dictation') return 'dictation'
  if (item.exerciseItem.exerciseType === 'cloze') return item.source === 'grammar' ? 'pattern_recognition' : 'contextual_cloze'
  return null
}

function sourceRefFor(item: SessionQueueItem): string | null {
  if (item.source === 'vocab') {
    return item.exerciseItem.learningItem?.id ? `learning_items/${item.exerciseItem.learningItem.id}` : null
  }
  return item.grammarPatternId
}

export function diagnoseSessionItems(input: {
  items: SessionQueueItem[]
  projection: CapabilityProjection
  health: CapabilityHealthReport
}): SessionCapabilityDiagnostic[] {
  const readinessByKey = new Map(input.health.results.map(result => [result.canonicalKey, result.readiness]))

  return input.items.map(item => {
    const identity = getStableSessionItemIdentity(item)
    const capabilityType = capabilityTypeFor(item)
    const sourceRef = sourceRefFor(item)
    const capability = input.projection.capabilities.find(candidate =>
      candidate.sourceRef === sourceRef
      && candidate.capabilityType === capabilityType
      && candidate.skillType === item.exerciseItem.skillType,
    )

    if (!capability) {
      return {
        sessionItemId: identity.sessionItemId,
        severity: 'warn',
        message: 'Session item does not map to a projected capability.',
      }
    }

    const readiness = readinessByKey.get(capability.canonicalKey)
    if (!readiness || readiness.status !== 'ready') {
      return {
        sessionItemId: identity.sessionItemId,
        impliedCapabilityKey: capability.canonicalKey,
        readiness,
        severity: 'critical',
        message: 'Session item maps to a non-ready capability.',
      }
    }

    return {
      sessionItemId: identity.sessionItemId,
      impliedCapabilityKey: capability.canonicalKey,
      readiness,
      severity: 'info',
      message: 'Session item maps to a ready capability.',
    }
  })
}
