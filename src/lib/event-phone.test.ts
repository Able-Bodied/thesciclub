import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestDb {
  updates: { table: string; values: unknown; id: unknown }[];
  row: { phone: string | null } | null;
  error: { message: string } | null;
}
const db = vi.hoisted((): TestDb => ({ updates: [], row: { phone: null }, error: null }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: db.row, error: db.error }),
        }),
      }),
      update: (values: unknown) => ({
        eq: (_column: string, id: unknown) => {
          db.updates.push({ table, values, id });
          return Promise.resolve({ error: db.error });
        },
      }),
    }),
  }),
}));

const { displayPhone, loadOwnPhone, saveOwnPhone } = await import('@/lib/event-phone');

beforeEach(() => {
  db.updates = [];
  db.row = { phone: null };
  db.error = null;
});

describe('saveOwnPhone', () => {
  it('stores 1 and ten digits, the shape onboarding writes', async () => {
    const result = await saveOwnPhone('u1', '(408) 555-0112');
    expect(result).toEqual({ ok: true });
    expect(db.updates).toEqual([{ table: 'members', values: { phone: '14085550112' }, id: 'u1' }]);
  });

  it('clears it with null', async () => {
    await saveOwnPhone('u1', null);
    expect(db.updates[0]?.values).toEqual({ phone: null });
  });

  it('refuses a number that is not ten digits, without asking the database', async () => {
    const result = await saveOwnPhone('u1', '555-0112');
    expect(result.ok).toBe(false);
    expect(db.updates).toEqual([]);
  });

  it('says so when the write fails', async () => {
    db.error = { message: 'permission denied' };
    const result = await saveOwnPhone('u1', '(408) 555-0112');
    expect(result.ok).toBe(false);
  });
});

describe('loadOwnPhone', () => {
  it('reads the member’s own number, or null for none', async () => {
    db.row = { phone: '14085550112' };
    expect(await loadOwnPhone('u1')).toEqual({ ok: true, phone: '14085550112' });
    db.row = { phone: null };
    expect(await loadOwnPhone('u1')).toEqual({ ok: true, phone: null });
  });

  it('reports a failed read as a failure, not as having no number', async () => {
    db.error = { message: 'boom' };
    const result = await loadOwnPhone('u1');
    expect(result.ok).toBe(false);
  });
});

describe('displayPhone', () => {
  it('formats the stored digits', () => {
    expect(displayPhone('14085550112')).toBe('(408) 555-0112');
  });
});
