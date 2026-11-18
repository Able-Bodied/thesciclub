import { describe, expect, it } from 'vitest';
import { groupInvites, type TrackedInvite } from '@/lib/invite-tracking';

const base: TrackedInvite = {
  id: '1',
  email: 'a@example.com',
  name: null,
  inviterName: 'Ada',
  eventId: null,
  eventTitle: null,
  eventStart: null,
  createdAt: '2026-11-14T18:00:00Z',
  sentAt: '2026-11-14T18:00:00Z',
  openedAt: null,
  linkOpenedAt: null,
  rsvp: null,
  startedAt: null,
  joinedAt: null,
  memberName: null,
  reachedStep: null,
};

describe('how the invites did', () => {
  it('groups by event, else by sender and day, and counts a later step as the earlier ones', () => {
    const dinner = {
      eventId: 'e1',
      eventTitle: 'Board dinner',
      eventStart: '2026-11-23T03:00:00Z',
    };
    const groups = groupInvites(
      [
        { ...base, id: '1', ...dinner, openedAt: '2026-11-14T19:00:00Z' },
        // Joined without the picture ever loading: opened, viewed and joined.
        { ...base, id: '2', ...dinner, rsvp: 'going', joinedAt: '2026-11-15T01:00:00Z' },
        // Made an account from the link and stopped at the city step: started, not joined.
        {
          ...base,
          id: '3',
          ...dinner,
          rsvp: 'interested',
          startedAt: '2026-11-14T20:00:00Z',
          reachedStep: 'city',
        },
        { ...base, id: '4' },
        // 4 PM in Los Angeles on the 13th is the 14th in UTC: a day of its own.
        { ...base, id: '5', createdAt: '2026-11-14T00:30:00Z' },
      ],
      'America/Los_Angeles',
    );
    expect(groups.map((g) => [g.title, g.when, g.invites.length])).toEqual([
      ['Board dinner', 'Nov 22, 2026', 3],
      ['From Ada', 'Nov 14, 2026', 1],
      ['From Ada', 'Nov 13, 2026', 1],
    ]);
    expect(groups[0]?.counts).toEqual({
      sent: 3,
      opened: 3,
      viewed: 2,
      started: 2,
      going: 1,
      joined: 1,
    });
  });
});
