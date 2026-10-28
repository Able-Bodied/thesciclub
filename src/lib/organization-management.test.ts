import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({
  calls: [] as [string, unknown][],
  error: null as { message: string; code: string } | null,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      rpc.calls.push([name, args]);
      return Promise.resolve({ data: null, error: rpc.error });
    },
  }),
}));

const { saveOrganizationPlaces } = await import('@/lib/organization-management');

beforeEach(() => {
  rpc.calls = [];
  rpc.error = null;
});

describe('saveOrganizationPlaces', () => {
  it('sends the places in order, keeping the id of one already saved, with their ZIP codes', async () => {
    expect(
      await saveOrganizationPlaces('org', [
        {
          id: 'p1',
          label: null,
          address: '3075 Adeline St',
          city: 'Berkeley',
          state: 'CA',
          postalCode: '94703',
        },
        { label: 'Pool', address: null, city: 'Oakland', state: 'CA', postalCode: null },
      ]),
    ).toEqual({ ok: true });
    expect(rpc.calls).toEqual([
      [
        'save_organization_places',
        {
          p_organization: 'org',
          p_places: [
            {
              id: 'p1',
              label: null,
              address: '3075 Adeline St',
              city: 'Berkeley',
              state: 'CA',
              postal_code: '94703',
            },
            { label: 'Pool', address: null, city: 'Oakland', state: 'CA', postal_code: null },
          ],
        },
      ],
    ]);
  });

  it('passes the database’s own sentence through', async () => {
    rpc.error = { message: 'Give up to fifty places.', code: '22023' };
    expect(await saveOrganizationPlaces('org', [])).toEqual({
      ok: false,
      error: 'Give up to fifty places.',
    });
  });
});
