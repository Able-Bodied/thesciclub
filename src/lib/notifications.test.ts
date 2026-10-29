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

  it('says who reacted with what, to a message or a post', () => {
    expect(notificationSentence(n({ kind: 'reaction', detail: 'message:👍' }))).toBe(
      'Jan reacted 👍 to your message',
    );
    expect(
      notificationSentence(n({ kind: 'reaction', detail: 'message:❤️', place: 'Swimmers' })),
    ).toBe('Jan reacted ❤️ to your message in Swimmers');
    expect(notificationSentence(n({ kind: 'reaction', detail: 'post:🎉', place: 'Ramps' }))).toBe(
      'Jan reacted 🎉 to your post in “Ramps”',
    );
    // Folded, the others may have chosen another emoji.
    expect(
      notificationSentence(n({ kind: 'reaction', count: 3, detail: 'post:🎉', place: 'Ramps' })),
    ).toBe('Jan and 2 others reacted to your post in “Ramps”');
    expect(notificationSentence(n({ kind: 'reaction', detail: null, place: 'Ramps' }))).toBe(
      'Jan reacted to your post in “Ramps”',
    );
  });

  // 20261029070000: an @username in a post.
  it('says who mentioned the member, and in which topic', () => {
    expect(notificationSentence(n({ kind: 'mention', place: 'Ramps' }))).toBe(
      'Jan mentioned you in “Ramps”',
    );
    expect(notificationSentence(n({ kind: 'mention', actorName: null }))).toBe(
      'A member mentioned you in a topic',
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

  it('names the grant, its organization and when applications close', () => {
    const year = new Date().getFullYear();
    expect(
      notificationSentence(
        n({
          kind: 'grant_open',
          place: 'Kelly Brush Foundation',
          excerpt: 'Active Fund',
          detail: `${year}-11-15`,
        }),
      ),
    ).toBe('Active Fund from Kelly Brush Foundation is open for applications until Nov 15');
  });

  it("says a join came from the administrator's QR code, and where", () => {
    expect(
      notificationSentence(
        n({ kind: 'invite_joined', place: 'Dana', detail: 'qr:Abilities Expo LA' }),
      ),
    ).toBe('Dana joined from your QR code at Abilities Expo LA');
    expect(notificationSentence(n({ kind: 'invite_joined', place: 'Dana', detail: 'qr:' }))).toBe(
      'Dana joined from your QR code',
    );
  });

  it('counts the week’s blocks for an administrator, naming nobody', () => {
    expect(notificationSentence(n({ kind: 'blocks_weekly', detail: '3', actorName: null }))).toBe(
      '3 members were blocked this week',
    );
    expect(notificationSentence(n({ kind: 'blocks_weekly', detail: '1', actorName: null }))).toBe(
      '1 member was blocked this week',
    );
  });

  it('reminds of the step that is left', () => {
    expect(notificationSentence(n({ kind: 'profile_reminder', detail: 'details' }))).toBe(
      'Finish Your details, so other members can find you',
    );
    expect(notificationSentence(n({ kind: 'profile_reminder', detail: 'profile' }))).toBe(
      'Finish your profile, so members can find what you have in common',
    );
  });
});
