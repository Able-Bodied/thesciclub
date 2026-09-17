import { describe, expect, it } from 'vitest';
import { organizationByName } from '@/lib/organizations';
import type { Organization } from '@/types/domain';

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
