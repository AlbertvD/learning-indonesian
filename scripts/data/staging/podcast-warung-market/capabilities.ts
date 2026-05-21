import { projectCapabilities } from '@/lib/capabilities'
import { projectPodcastCapabilities } from '../../../lib/pipeline/podcast-stage/podcastProjectionRules'
import { podcastSegments } from './podcast-segments'
import { podcastPhrases } from './podcast-phrases'

const snapshot = {
  learningItems: [],
  grammarPatterns: [],
  podcastSegments,
  podcastPhrases,
}

export const podcastCapabilityProjection = projectCapabilities(snapshot)

// Decision 4: shared catalog no longer emits podcast capabilities.
// Concatenate the dedicated podcast rule's output to preserve the existing
// staging-export shape.
export const capabilities = [
  ...podcastCapabilityProjection.capabilities,
  ...projectPodcastCapabilities(snapshot),
]
