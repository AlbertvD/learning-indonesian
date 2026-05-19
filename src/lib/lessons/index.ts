// src/lib/lessons/index.ts
//
// Public barrel for the `lib/lessons/` deep module.
//
// Populated incrementally across the fold PR:
//   - Commit 1: created empty (this commit)
//   - Commit 2: re-exports from overview / overviewStatus / experience / actionModel / activation
//   - Commit 6: re-exports from adapter (folded lesson-domain methods from services/lessonService.ts)
//
// Per docs/target-architecture.md §Module conventions, index.ts is the inbound
// port: it declares what callers can use. Internal files are not re-exported.
export {}
