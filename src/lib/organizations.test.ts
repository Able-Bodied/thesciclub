import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { organizationByName, useOrganizations } from '@/lib/organizations';
import type { Organization } from '@/types/domain';

const directory = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      let columns = '';
      const query = {
        select: (wanted: string) => {
          columns = wanted;
          directory.asked.push(wanted);
          return query;
        },
        is: () => query,
        order: () => query,
        range: () =>
          Promise.resolve(
            columns.includes('postal_code')
              ? {
                  data: null,
                  error: {
                    code: '42703',
                    message: 'column organization_places_1.postal_code does not exist',
                  },
                }
              : {
                  data: [
                    {
                      id: 'o1',
                      short_code: 'BORP',
                      name: 'BORP',
                      city: 'Berkeley',
                      description: '',
                      tags: null,
                      can_invite: false,
                      logo_path: null,
                      state: 'CA',
                      organization_places: [
                        {
                          id: 'p1',
                          position: 0,
                          label: null,
                          address: null,
                          city: 'Berkeley',
                          state: 'CA',
                        },
                      ],
                    },
                  ],
                  error: null,
                },
          ),
      };
      return query;
    },
  }),
}));

const org = (o: Partial<Organization> = {}): Organization => ({
  id: 'o1',
  shortCode: 'NCS',
  name: 'NorCal SCI',
  city: 'Northern California',
  description: '',
  tags: [],
  canInvite: true,
  logoPath: 'organizations/ncs.webp',
  ...o,
});

describe('finding the organization behind an affiliation', () => {
  const all = [org(), org({ id: 'o2', shortCode: 'SC', name: 'SCVMC SCI Peer Support' })];

  it('matches the name', () => {
    expect(organizationByName(all, 'NorCal SCI')?.id).toBe('o1');
    expect(organizationByName(all, 'SCVMC SCI Peer Support')?.id).toBe('o2');
  });

  // The directory was typed by hand, and trailing spaces and casing have
  // both turned up in it.
  it('is not fooled by spacing or case', () => {
    expect(organizationByName(all, '  norcal sci ')?.id).toBe('o1');
  });

  it('falls back to the short code', () => {
    expect(organizationByName(all, 'NCS')?.id).toBe('o1');
  });

  // An affiliation is free text and several name bodies the club has no row
  // for. Those have to render, as the short-code tile — hence null rather
  // than an error.
  it('returns null for an affiliation the club has no row for', () => {
    expect(organizationByName(all, 'Rotary Club of Aptos')).toBeNull();
    expect(organizationByName(all, '')).toBeNull();
    expect(organizationByName(all, null)).toBeNull();
  });

  // The case that made this worth pinning: a name that is *nearly* an
  // organization's is not that organization. Bob and Matt carried
  // "Christopher Reeve Foundation" while the club's row read "Christopher &
  // Dana Reeve Foundation", and the answer was to correct the two members
  // (20260916000000), not to teach this to match on resemblance.
  it('does not match a name that merely resembles one', () => {
    const reeve = org({
      id: 'o3',
      shortCode: 'CDRF',
      name: 'Christopher & Dana Reeve Foundation',
    });
    expect(organizationByName([...all, reeve], 'Christopher Reeve Foundation')).toBeNull();
    expect(organizationByName([...all, reeve], 'Christopher & Dana Reeve Foundation')?.id).toBe(
      'o3',
    );
  });
});

describe('an organization’s places', () => {
  it('come main place first, with the row’s own fields only', async () => {
    const { toOrganization } = await import('@/lib/organizations');
    const read = toOrganization({
      id: 'o1',
      short_code: 'BORP',
      name: 'BORP',
      city: 'Berkeley',
      description: '',
      tags: null,
      can_invite: false,
      logo_path: null,
      state: 'CA',
      organization_places: [
        { id: 'p2', position: 1, label: 'Gym', address: null, city: 'Oakland', state: 'CA' },
        {
          id: 'p1',
          position: 0,
          label: null,
          address: '3075 Adeline St',
          city: 'Berkeley',
          state: 'CA',
          postal_code: '94703',
        },
      ],
    });
    expect(read.places?.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(read.places?.[0]).toEqual({
      id: 'p1',
      position: 0,
      label: null,
      address: '3075 Adeline St',
      city: 'Berkeley',
      state: 'CA',
      postalCode: '94703',
    });
    // Read before 20261028700000, or none given.
    expect(read.places?.[1]?.postalCode).toBeNull();
  });
});

describe('an organization whose site names no place', () => {
  it('reads as an empty city', async () => {
    const { toOrganization } = await import('@/lib/organizations');
    const read = toOrganization({
      id: 'o1',
      short_code: 'WWM',
      name: 'Wheel with Me Foundation',
      city: null,
      description: '',
      tags: null,
      can_invite: false,
      logo_path: null,
      state: null,
    });
    expect(read.city).toBe('');
    expect(read.places).toEqual([]);
  });
});

// Until 20261028700000 is live, asking for the ZIP fails the whole read.
describe('the directory before ZIP codes are in the database', () => {
  it('is read again without them', async () => {
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.organizations[0]?.places?.[0]?.postalCode).toBeNull();
    expect(directory.asked.map((columns) => columns.includes('postal_code'))).toEqual([
      true,
      false,
    ]);
  });
});
