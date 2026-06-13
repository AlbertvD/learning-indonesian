// Collections — selectable word-lists (frequency bands + thematic packs).
// Public port. Internal files (adapter.ts) are not re-exported.
//
// This module owns the *collection* noun: resolving which words a learner's
// activated collections contain. It must NOT import lib/session-builder/,
// lib/scheduling/, or lib/analytics/ (target-architecture Rule 7, no back-edges)
// — session-builder consumes collections, not the reverse.
export { resolveActivatedMemberRefs } from './membership'
export { setCollectionActivated } from './activation'
