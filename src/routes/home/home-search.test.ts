import { describe, expect, it } from 'vitest';
import type { HomeTopic } from '@/lib/home/types';
import { searchHome } from '@/routes/home/home-search';
import { makeEvent, makeMember, makeOrganization } from '@/test/factory';

const sources = {
  topics: [{ id: 't1', title: 'Best handcycle for hills' } as HomeTopic],
  events: [makeEvent({ id: 'e1', title: '49er SCI Meetup', city: 'Campbell', location: '' })],
  members: [makeMember({ id: 'm1', displayName: 'Nicole Silva', city: 'Santa Clara' })],
  organizations: [makeOrganization({ id: 'o1', name: 'NorCal SCI', city: 'Concord', tags: [] })],
};

describe('searchHome', () => {
  it('finds nothing for nothing typed', () => {
    expect(searchHome('  ', sources).events).toEqual([]);
  });

  it('looks in each kind of thing, ignoring case', () => {
    expect(searchHome('HANDCYCLE', sources).topics).toHaveLength(1);
    expect(searchHome('campbell', sources).events).toHaveLength(1);
    expect(searchHome('santa clara', sources).members).toHaveLength(1);
    expect(searchHome('norcal', sources).organizations).toHaveLength(1);
  });

  it('needs every word', () => {
    expect(searchHome('nicole concord', sources).members).toEqual([]);
  });

  it('shows a few of each', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: 'Swim', city: '', location: '' }),
    );
    expect(searchHome('swim', { ...sources, events }).events).toHaveLength(5);
  });
});
