// src/lib/chunkedQuery.ts
import { supabase } from '@/lib/supabase'

const CHUNK_SIZE = 50

/**
 * Run a Supabase query in chunks to avoid Kong's URL length limit
 * when using .in() with many UUIDs.
 *
 * @param queryFn - Optional function to add filters (e.g. `.eq('is_active', true)`)
 *                  or override the select (e.g. `.select('id, name')`)
 */
export async function chunkedIn<T>(
  table: string,
  column: string,
  ids: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFn?: (builder: any) => any,
): Promise<T[]> {
  if (ids.length === 0) return []
  const results: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    let builder = supabase.schema('indonesian').from(table).select('*').in(column, chunk)
    if (queryFn) builder = queryFn(builder)
    const { data, error } = await builder
    if (error) throw error
    results.push(...(data as T[]))
  }
  return results
}
