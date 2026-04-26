import { capabilities } from './capabilities'

export const exerciseAssets = capabilities.flatMap(capability => capability.requiredArtifacts.map(artifactKind => ({
  asset_key: `${capability.canonicalKey}:${artifactKind}`,
  capability_key: capability.canonicalKey,
  artifact_kind: artifactKind,
  quality_status: 'approved',
  payload_json: {
    sourceRef: capability.sourceRef,
    pilot: true,
  },
})))
