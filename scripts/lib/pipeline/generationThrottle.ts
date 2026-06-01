/**
 * generationThrottle — shared anti-burst pacing for the in-stage LLM generators.
 *
 * Anthropic rate limits are per-minute (RPM + TPM). A single publish fires a
 * burst of Sonnet calls (item distractors + one per grammar pattern), which on a
 * low usage tier trips the limit and — once the SDK's retries exhaust — throws
 * and fails the publish mid-run. Spacing the calls keeps a publish under the
 * per-minute ceiling. This pairs with a raised `maxRetries` on each client (the
 * SDK honours `Retry-After` + backs off) so a transient 429 is absorbed, not fatal.
 *
 * Applied ONLY on the real-API path (the injected `generateFn` test seam never
 * sleeps), so tests stay fast. Tunable via `GENERATION_THROTTLE_MS` (default
 * 1500ms; set 0 to disable, e.g. once on a higher tier).
 */

export const GENERATION_THROTTLE_MS = ((): number => {
  const raw = Number(process.env.GENERATION_THROTTLE_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 1500
})()

/** Raised SDK retry count — the SDK backs off + honours Retry-After on 429/529. */
export const ANTHROPIC_MAX_RETRIES = 5

export function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}
