import type { Failure } from '@/lib/describe-error';

export const READ_PAGE_SIZE = 500;

/** Complete a read instead of accepting PostgREST's silently capped first page.
 * Callers supply a stable order, including a unique tie-breaker, and an abort signal.
 * A failed later page returns no partial list that could look like complete data.
 */
export async function readPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Failure | null }>,
): Promise<{ data: T[] | null; error: Failure | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += READ_PAGE_SIZE) {
    const result = await page(from, from + READ_PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < READ_PAGE_SIZE) return { data: rows, error: null };
  }
}
