import { projectCapabilities } from '../../../../src/lib/capabilities/capabilityCatalog'
import { podcastSegments } from './podcast-segments'
import { podcastPhrases } from './podcast-phrases'

export const podcastCapabilityProjection = projectCapabilities({
  learningItems: [],
  grammarPatterns: [],
  podcastSegments,
  podcastPhrases,
})

export const capabilities = podcastCapabilityProjection.capabilities
