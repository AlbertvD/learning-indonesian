// src/lib/chunkedQuery.ts
import { supabase } from '@/lib/supabase'

const CHUNK_SIZE = 50

// Loose-typed shape so callers can pass either the global supabase client or
// the project's typed `SupabaseSchemaClient` (which constrains `schema` to a
// literal). We only need the bare minimum surface here.
type SchemaClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: (name: any) => {
    from: (table: string) => unknown
  }
}

/**
 * Run a Supabase query in chunks to avoid Kong's URL length limit
 * when using .in() with many UUIDs.
 *
 * @param queryFn - Optional function to add filters (e.g. `.eq('is_active', true)`)
 *                  or override the select (e.g. `.select('id, name')`)
 * @param client - Optional Supabase client. Defaults to the global browser client;
 *                 callers that need to inject a custom client (services that
 *                 receive `client` as an argument for testability) pass it here.
 */
export async function chunkedIn<T>(
  table: string,
  column: string,
  ids: string[],

  queryFn?: (builder: any) => any,
  client?: SchemaClient,
): Promise<T[]> {
  if (ids.length === 0) return []
  const results: T[] = []
  const sb = client ?? supabase
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    let builder = (sb.schema('indonesian').from(table) as any).select('*').in(column, chunk)
    if (queryFn) builder = queryFn(builder)
    const { data, error } = await builder
    if (error) throw error
    results.push(...(data as T[]))
  }
  return results
}
