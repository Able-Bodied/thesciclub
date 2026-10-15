import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJoiningIsOpen,
  fetchJoiningSetting,
  setJoiningOpen,
  useJoiningIsOpen,
} from '@/lib/joining';

/** Only `@/lib/supabase` is stubbed; the module under test is the real one. */

const db = vi.hoisted(() => ({
  rpcCalls: [] as [string, Record<string, unknown> | undefined][],
  rpcData: null as boolean | null,
  rpcError: null as { message: string; code?: string } | null,
  rpcThrows: false,
  row: null as Record<string, unknown> | null,
  rowError: null as { message: string; code?: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        maybeSingle: () =>
          Promise.resolve(
            table === 'club_joining' && columns === 'open, changed_at'
              ? { data: db.row, error: db.rowError }
              : { data: null, error: { message: `unexpected ${table} ${columns}` } },
          ),
      }),
    }),
    rpc: (name: string, args?: Record<string, unknown>) => {
      db.rpcCalls.push([name, args]);
      if (db.rpcThrows) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ data: db.rpcData, error: db.rpcError });
    },
  }),
}));

beforeEach(() => {
  db.rpcCalls = [];
  db.rpcData = null;
  db.rpcError = null;
  db.rpcThrows = false;
  db.row = null;
  db.rowError = null;
});

describe('whether joining is open', () => {
  it('is open only when the database says true', async () => {
    db.rpcData = true;
    expect(await fetchJoiningIsOpen()).toBe(true);
    expect(db.rpcCalls).toEqual([['joining_is_open', undefined]]);
  });

  it('reads as closed on false, on a refusal and when offline', async () => {
    db.rpcData = false;
    expect(await fetchJoiningIsOpen()).toBe(false);
    db.rpcData = true;
    db.rpcError = { message: 'nope', code: '42501' };
    expect(await fetchJoiningIsOpen()).toBe(false);
    db.rpcError = null;
    db.rpcThrows = true;
    expect(await fetchJoiningIsOpen()).toBe(false);
  });

  it('starts closed and turns open when the answer comes', async () => {
    db.rpcData = true;
    const { result } = renderHook(() => useJoiningIsOpen());
    expect(result.current).toBe(false);
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});

describe("the administrator's switch", () => {
  it('reads the row', async () => {
    db.row = { open: true, changed_at: '2026-10-14T17:00:00Z' };
    expect(await fetchJoiningSetting()).toEqual({
      ok: true,
      setting: { open: true, changedAt: '2026-10-14T17:00:00Z' },
    });
  });

  it('says so when the row cannot be read', async () => {
    const result = await fetchJoiningSetting();
    expect(result.ok).toBe(false);
  });

  it('saves through the admin-only function', async () => {
    expect(await setJoiningOpen(true)).toEqual({ ok: true });
    expect(await setJoiningOpen(false)).toEqual({ ok: true });
    expect(db.rpcCalls).toEqual([
      ['admin_set_joining_open', { p_open: true }],
      ['admin_set_joining_open', { p_open: false }],
    ]);
  });

  it("passes on the database's refusal", async () => {
    db.rpcError = { message: 'Only an administrator can do that.' };
    expect(await setJoiningOpen(true)).toEqual({
      ok: false,
      error: 'Only an administrator can do that.',
    });
  });
});
