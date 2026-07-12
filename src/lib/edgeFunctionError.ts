// src/lib/edgeFunctionError.ts
//
// Shared helper for parsing the `{ error: <code> }` body Supabase edge
// functions return on non-2xx responses. `supabase.functions.invoke` never
// throws — it resolves `{ data: null, error: FunctionsHttpError }` whose
// `.context` is the raw Response. Profile.tsx's delete-account flow grew a
// local `extractErrorCode` copy first; the Stripe checkout/portal/verify
// call sites (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3)
// need the identical parse, so it moved here as the one shared reader
// instead of a third/fourth copy.
import { FunctionsHttpError } from '@supabase/supabase-js'

export async function extractEdgeFunctionErrorCode(error: unknown): Promise<string | undefined> {
  if (!(error instanceof FunctionsHttpError)) return undefined
  try {
    const body = await error.context.json()
    return typeof body?.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}
