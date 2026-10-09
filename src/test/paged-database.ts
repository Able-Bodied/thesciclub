/** A REST boundary with the same default row cap as the local API.
 * Tests keep the real hooks and force them to request subsequent pages.
 */
export function pagedDatabase(tables: Record<string, Record<string, unknown>[]>) {
  const requests: { table: string; first: number; last: number }[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const order: { column: string; ascending: boolean }[] = [];
    let first = 0;
    let last = 999;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return query;
      },
      gte: (column: string, value: string) => {
        rows = rows.filter((row) => String(row[column]) >= value);
        return query;
      },
      lte: (column: string, value: string) => {
        rows = rows.filter((row) => String(row[column]) <= value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return query;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        order.push({ column, ascending: options?.ascending ?? true });
        return query;
      },
      range: (start: number, end: number) => {
        first = start;
        last = end;
        return query;
      },
      abortSignal: () => query,
      overrideTypes: () => query,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
      then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) => {
        requests.push({ table, first, last });
        rows.sort((a, b) => {
          for (const { column, ascending } of order) {
            const comparison = String(a[column]).localeCompare(String(b[column]));
            if (comparison) return ascending ? comparison : -comparison;
          }
          return 0;
        });
        return Promise.resolve(
          resolve({ data: rows.slice(first, Math.min(last + 1, first + 1000)), error: null }),
        );
      },
    };
    return query;
  };
  return { from, requests };
}
