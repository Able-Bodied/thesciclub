import { describe, expect, it, vi } from 'vitest';
import { READ_PAGE_SIZE, readPages } from '@/lib/read-pages';

describe('complete REST reads', () => {
  it('continues beyond the API cap and includes the tail', async () => {
    const rows = Array.from({ length: 1005 }, (_, id) => ({ id }));
    const page = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    );
    expect((await readPages(page)).data).toEqual(rows);
    expect(page).toHaveBeenCalledTimes(3);
  });
  it('checks the next page when the last full page lands on the boundary', async () => {
    const page = vi.fn((from: number) =>
      Promise.resolve({ data: from === 0 ? Array(READ_PAGE_SIZE).fill(1) : [], error: null }),
    );
    expect((await readPages(page)).data).toHaveLength(READ_PAGE_SIZE);
    expect(page).toHaveBeenCalledTimes(2);
  });
  it('does not present a partial result as complete when a later page fails', async () => {
    const failure = { message: 'Connection lost' };
    const result = await readPages((from) =>
      Promise.resolve(
        from === 0
          ? { data: Array(READ_PAGE_SIZE).fill(1), error: null }
          : { data: null, error: failure },
      ),
    );
    expect(result).toEqual({ data: null, error: failure });
  });
});
