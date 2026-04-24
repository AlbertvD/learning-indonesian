// src/components/page/primitives/cx.ts
// Tiny class-name join utility used across the page framework primitives.
// Drops falsy values so conditional classes don't leave trailing whitespace.
// Zero-dependency; `clsx` was considered and rejected as over-kill for one
// callsite-shape across 13 primitives.

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
