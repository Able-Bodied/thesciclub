import { describe, expect, it } from 'vitest';
import {
  rankMembers,
  relevanceScore,
  sharedInterests,
  sortMembers,
  sortNote,
  stageScore,
} from '@/routes/peers/ranking';
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

// The owner, 2026-11-16: sort Peers by date joined, age, distance and time
// since injury. A member with nothing to sort by goes last, in either direction.
describe('sortMembers', () => {
  const a = makeMember({ id: 'a', age: 30, createdAt: '2026-11-01T00:00:00Z', ...injured(2) });
  const b = makeMember({ id: 'b', age: 50, createdAt: '2026-11-10T00:00:00Z', ...injured(10) });
  const unknown = makeMember({ id: 'u', age: null, createdAt: '2026-10-01T00:00:00Z' });
  const ids = (members: { id: string }[]) => members.map((m) => m.id);

  it('puts members with no answer last, whichever way it sorts', () => {
    expect(ids(sortMembers([unknown, b, a], 'youngest'))).toEqual(['a', 'b', 'u']);
    expect(ids(sortMembers([unknown, a, b], 'oldest'))).toEqual(['b', 'a', 'u']);
    expect(ids(sortMembers([unknown, b, a], 'recently-injured'))).toEqual(['a', 'b', 'u']);
    expect(ids(sortMembers([unknown, a, b], 'longest-injured'))).toEqual(['b', 'a', 'u']);
  });

  it('sorts by joining, newest first, and by distance where it is known', () => {
    expect(ids(sortMembers([a, unknown, b], 'newest'))).toEqual(['b', 'a', 'u']);
    const miles = new Map([
      ['a', 40],
      ['b', 5],
    ]);
    expect(ids(sortMembers([unknown, a, b], 'nearest', miles))).toEqual(['b', 'a', 'u']);
    expect(ids(sortMembers([b, unknown, a], 'name'))).toEqual(['b', 'u', 'a']);
  });
});

describe('sortNote', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  it('says what the deck is sorted by, and nothing it cannot know', () => {
    const member = makeMember({ id: 'a', createdAt: '2026-11-03T18:00:00Z', ...injured(4) });
    expect(sortNote(member, 'nearest', new Map([['a', 12.4]]), now)).toBe('12 mi away');
    expect(sortNote(member, 'nearest', new Map(), now)).toBeNull();
    expect(sortNote(member, 'newest', new Map(), now)).toBe('Joined Nov 3');
    expect(sortNote(member, 'youngest', new Map(), now)).toBeNull();
  });
});
