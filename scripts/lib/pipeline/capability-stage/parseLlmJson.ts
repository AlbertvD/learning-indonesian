// scripts/lib/pipeline/capability-stage/parseLlmJson.ts
//
// Extract the JSON payload from a raw LLM response. Models occasionally wrap
// the requested JSON in reasoning prose and/or a ```json fence even when the
// prompt demands bare JSON — verified live 2026-07-04 on lesson 28: every
// 3-sentence dialogue line drew a prose preamble before a perfectly valid
// cloze object, and the fence-only parsers dropped it (CS22 → status=partial
// → promotion skipped). Strategy: try the fence-stripped text verbatim, then
// the outermost open…close span. Returns null when nothing parses — callers
// keep their own shape checks (this widens ACCEPTANCE of packaging, never of
// content).

function outermostSpan(s: string, open: string, close: string): string | null {
  const a = s.indexOf(open)
  const b = s.lastIndexOf(close)
  return a !== -1 && b > a ? s.slice(a, b + 1) : null
}

export function extractLlmJson(raw: string, open: '{' | '[', close: '}' | ']'): unknown {
  const cleaned = raw.replace(/^```json\s*/u, '').replace(/\s*```\s*$/u, '').trim()
  for (const candidate of [cleaned, outermostSpan(cleaned, open, close)]) {
    if (!candidate) continue
    try {
      return JSON.parse(candidate)
    } catch {
      // try the next extraction strategy
    }
  }
  return null
}
