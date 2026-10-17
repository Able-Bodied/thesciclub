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

export const ID_BATCH = 100;

/**
 * Read for a long list of ids a hundred at a time, side by side, and join the
 * results. A GET carries `in.(…)` in its URL: a thousand ids is about 37KB of
 * query string, past what the API's gateway accepts (2026-10-14). The first
 * failure, if any, is the answer, with no partial list.
 */
export async function readInBatches<T>(
  ids: readonly string[],
  read: (batch: string[]) => PromiseLike<{ data: T[] | null; error: Failure | null }>,
): Promise<{ data: T[] | null; error: Failure | null }> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) batches.push(ids.slice(i, i + ID_BATCH));
  const results = await Promise.all(batches.map(read));
  const failed = results.find((result) => result.error);
  if (failed) return { data: null, error: failed.error };
  return { data: results.flatMap((result) => result.data ?? []), error: null };
}
