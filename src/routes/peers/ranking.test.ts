import { describe, expect, it } from 'vitest';
import { rankMembers, relevanceScore, sharedInterests, stageScore } from '@/routes/peers/ranking';
import { makeMember } from '@/test/factory';

/** Roughly N years before today, so tests do not rot. */
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
};
const injured = (n: number) => ({ injuryDate: yearsAgo(n), injuryDatePrecision: 'year' as const });

describe('sharedInterests', () => {
  it('returns the overlap', () => {
    const a = makeMember({ interests: ['Travel', 'Cycling'] });
    const b = makeMember({ interests: ['Cycling', 'Reading'] });
    expect(sharedInterests(a, b)).toEqual(['Cycling']);
  });
});

describe('stageScore', () => {
  it('is null when either side has no injury date', () => {
    expect(stageScore(makeMember(), makeMember(injured(5)))).toBeNull();
    expect(stageScore(makeMember(injured(5)), makeMember())).toBeNull();
  });

  it('a newly injured viewer scores somebody years ahead above a fellow beginner', () => {
    const viewer = makeMember(injured(0));
    const ahead = stageScore(viewer, makeMember(injured(7)));
    const alsoNew = stageScore(viewer, makeMember(injured(0)));
    expect(ahead).toBeGreaterThan(alsoNew ?? 0);
  });

  it('an established viewer scores a similar stage highest — the opposite rule', () => {
    const viewer = makeMember(injured(10));
    const similar = stageScore(viewer, makeMember(injured(10)));
    const veryDifferent = stageScore(viewer, makeMember(injured(1)));
    expect(similar).toBeGreaterThan(veryDifferent ?? 0);
  });
});

describe('relevanceScore', () => {
  it('weighs the same state above everything else', () => {
    const viewer = makeMember({ state: 'CA', region: 'Cervical' });
    const sameState = makeMember({ state: 'CA', region: 'Thoracic' });
    const sameRegionElsewhere = makeMember({ state: 'ID', region: 'Cervical' });
    expect(relevanceScore(viewer, sameState)).toBeGreaterThan(
      relevanceScore(viewer, sameRegionElsewhere),
    );
  });

  it('weighs a matching injury region above shared interests', () => {
    const viewer = makeMember({ region: 'Cervical', interests: ['Travel', 'Cycling', 'Reading'] });
    const sameRegion = makeMember({ region: 'Cervical', interests: [] });
    const sharedHobbies = makeMember({
      region: 'Thoracic',
      interests: ['Travel', 'Cycling', 'Reading'],
    });
    expect(relevanceScore(viewer, sameRegion)).toBeGreaterThan(
      relevanceScore(viewer, sharedHobbies),
    );
  });

  it('does not treat two Unknown regions as a match', () => {
    const viewer = makeMember({ region: 'Unknown' });
    const alsoUnknown = makeMember({ region: 'Unknown' });
    const known = makeMember({ region: 'Cervical' });
    expect(relevanceScore(viewer, alsoUnknown)).toBe(relevanceScore(viewer, known));
  });

  it('lifts mentors for a newly injured viewer', () => {
    const viewer = makeMember(injured(0));
    const mentor = makeMember({ ...injured(3), type: 'mentor' });
    const peer = makeMember({ ...injured(3), type: 'peer' });
    expect(relevanceScore(viewer, mentor)).toBeGreaterThan(relevanceScore(viewer, peer));
  });

  it('does not lift mentors for an established viewer', () => {
    const viewer = makeMember(injured(12));
    const mentor = makeMember({ ...injured(12), type: 'mentor' });
    const peer = makeMember({ ...injured(12), type: 'peer' });
    expect(relevanceScore(viewer, mentor)).toBe(relevanceScore(viewer, peer));
  });

  it('does not penalise a member with no injury date', () => {
    const viewer = makeMember({ ...injured(5), state: 'CA', region: 'Thoracic' });
    const noDate = makeMember({ state: 'CA', region: 'Thoracic' });
    const withDate = makeMember({ ...injured(5), state: 'CA', region: 'Thoracic' });
    // The dated member scores higher, but the undated one still clears anybody
    // out of state — missing data must not read as irrelevance.
    const outOfState = makeMember({ ...injured(5), state: 'ID', region: 'Thoracic' });
    expect(relevanceScore(viewer, withDate)).toBeGreaterThan(relevanceScore(viewer, noDate));
    expect(relevanceScore(viewer, noDate)).toBeGreaterThan(relevanceScore(viewer, outOfState));
  });
});

describe('rankMembers', () => {
  it('keeps the incoming order when there is no viewer', () => {
    const deck = [makeMember({ displayName: 'A' }), makeMember({ displayName: 'B' })];
    expect(rankMembers(deck, null).map((m) => m.displayName)).toEqual(['A', 'B']);
  });

  it('does not mutate the array it was given', () => {
    const deck = [makeMember({ state: 'ID' }), makeMember({ state: 'CA' })];
    const before = [...deck];
    rankMembers(deck, makeMember({ state: 'CA' }));
    expect(deck).toEqual(before);
  });

  it('keeps ties in their incoming order, so the deck does not reshuffle', () => {
    const deck = [
      makeMember({ displayName: 'A', state: 'CA', region: 'Thoracic' }),
      makeMember({ displayName: 'B', state: 'CA', region: 'Thoracic' }),
      makeMember({ displayName: 'C', state: 'CA', region: 'Thoracic' }),
    ];
    const viewer = makeMember({ state: 'CA', region: 'Thoracic' });
    expect(rankMembers(deck, viewer).map((m) => m.displayName)).toEqual(['A', 'B', 'C']);
  });
});
