import { describe, expect, it } from 'vitest';
import { type AppNotification, notificationSentence } from '@/lib/notifications';

const n = (o: Partial<AppNotification>): AppNotification => ({
  id: 'n',
  kind: 'direct',
  count: 1,
  createdAt: '2026-10-09T10:00:00Z',
  seen: false,
  read: false,
  actorId: 'a',
  actorName: 'Jan',
  actorPhoto: null,
  place: null,
  excerpt: null,
  detail: null,
  url: '/home',
  ...o,
});

describe('what a notification says', () => {
  it('names who wrote, and counts what gathered while unread', () => {
    expect(notificationSentence(n({ kind: 'direct' }))).toBe('Message from Jan');
    expect(notificationSentence(n({ kind: 'direct', count: 3 }))).toBe('3 messages from Jan');
    expect(notificationSentence(n({ kind: 'group', place: 'Thursday swimmers' }))).toBe(
      'Jan wrote in Thursday swimmers',
    );
  });

  it('quotes the topic a reply or like was in', () => {
    expect(notificationSentence(n({ kind: 'reply', place: 'Best cushion?' }))).toBe(
      'Jan replied to your topic “Best cushion?”',
    );
    expect(notificationSentence(n({ kind: 'reply_participant', count: 2, place: 'Ramps' }))).toBe(
      '2 new replies in “Ramps”',
    );
    expect(notificationSentence(n({ kind: 'like', count: 3, place: 'Ramps' }))).toBe(
      'Jan and 2 others liked your post in “Ramps”',
    );
    expect(notificationSentence(n({ kind: 'like', count: 2, place: 'Ramps' }))).toBe(
      'Jan and 1 other liked your post in “Ramps”',
    );
  });

  it('says "A member" for a name that is missing, rather than nothing', () => {
    expect(notificationSentence(n({ actorName: null }))).toBe('Message from A member');
  });

  it('cuts a long title rather than letting it run on', () => {
    const sentence = notificationSentence(n({ kind: 'reply', place: 'x'.repeat(80) }));
    expect(sentence.endsWith('…”')).toBe(true);
    expect(sentence.length).toBeLessThan(100);
  });

  it('says what the rest are about', () => {
    expect(notificationSentence(n({ kind: 'group_add', place: 'Ramp builders' }))).toBe(
      'Jan added you to Ramp builders',
    );
    expect(notificationSentence(n({ kind: 'report', actorName: null }))).toBe(
      'A member reported something',
    );
    expect(notificationSentence(n({ kind: 'invite_joined', place: 'Sam' }))).toBe(
      'Sam joined the club on your invite',
    );
    expect(
      notificationSentence(n({ kind: 'event_reminder', place: 'Swim', detail: '6:30pm' })),
    ).toBe('Tomorrow at 6:30pm: Swim');
    expect(notificationSentence(n({ kind: 'org_events', place: 'NorCal SCI', detail: '2' }))).toBe(
      'NorCal SCI added 2 new events',
    );
    expect(notificationSentence(n({ kind: 'org_events', place: 'NorCal SCI', detail: '1' }))).toBe(
      'NorCal SCI added a new event',
    );
  });
});
