import { describe, expect, it } from 'vitest';
import { runsSport } from '@/lib/organization-sports';
import type { Organization } from '@/types/domain';

const organization = (fields: Partial<Organization>) =>
  ({ name: 'Club', description: '', tags: [], category: null, ...fields }) as Organization;

describe('runsSport', () => {
  it('reads the sport from the description and the tags', () => {
    expect(runsSport(organization({ description: 'Handcycling lessons' }), 'cycling')).toBe(true);
    expect(runsSport(organization({ tags: ['Winter sports'] }), 'winter')).toBe(true);
  });

  it('matches whole words', () => {
    expect(runsSport(organization({ description: 'A low risk program' }), 'winter')).toBe(false);
  });

  it('does not take a gym’s bikes for cycling', () => {
    const gym = organization({ category: 'gym', description: 'Stationary bikes' });
    expect(runsSport(gym, 'cycling')).toBe(false);
  });

  it('counts any named sport, or the word itself, as any sport', () => {
    expect(runsSport(organization({ tags: ['Adaptive sport'] }), 'any')).toBe(true);
    expect(runsSport(organization({ description: 'Surfing days' }), 'any')).toBe(true);
    expect(runsSport(organization({ description: 'Grants for rent' }), 'any')).toBe(false);
  });
});
