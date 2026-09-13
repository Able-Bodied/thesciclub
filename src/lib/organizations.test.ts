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

  // Bob is affiliated with the Christopher Reeve Foundation, which is not a
  // club organization. That has to render, as the short-code tile — hence
  // null rather than an error.
  it('returns null for an affiliation the club has no row for', () => {
    expect(organizationByName(all, 'Christopher Reeve Foundation')).toBeNull();
    expect(organizationByName(all, '')).toBeNull();
    expect(organizationByName(all, null)).toBeNull();
  });
});
