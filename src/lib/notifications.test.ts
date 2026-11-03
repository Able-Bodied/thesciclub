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

describe('the follow-up after an event', () => {
  it('names the event and asks for a review', () => {
    const asked = n({ kind: 'event_followup', actorName: null, place: 'Climbing' });
    expect(notificationSentence(asked)).toBe(
      'How was Climbing? Leave a review and add your pictures',
    );
  });
});

describe('a calendar invitation', () => {
  it.each([
    ['added', 'Weekly was added from your calendar'],
    ['updated', 'Weekly was updated from your calendar'],
    ['held', 'Weekly is waiting for approval'],
    ['choose', 'Choose which organization hosts Weekly'],
    ['refused', 'Weekly could not be added from your calendar'],
    ['cancelled', 'Weekly was taken off the calendar'],
  ])('says what became of it when %s', (detail, sentence) => {
    const told = n({ kind: 'calendar_invite', actorName: null, place: 'Weekly', detail });
    expect(notificationSentence(told)).toBe(sentence);
  });
});

describe('a request to add an organization', () => {
  it('says who asked, and tells them the answer', () => {
    const asked = n({
      kind: 'organization_request',
      actorName: 'Maya',
      place: 'Rolling Hikers',
      detail: 'asked',
    });
    expect(notificationSentence(asked)).toBe('Maya asked to add Rolling Hikers');
    expect(notificationSentence({ ...asked, detail: 'approved' })).toBe(
      'Rolling Hikers was added to the club',
    );
    expect(notificationSentence({ ...asked, detail: 'declined' })).toBe(
      'Rolling Hikers was not added to the club',
    );
  });
});

describe('a reminder to check in', () => {
  it('names the event', () => {
    const asked = n({ kind: 'check_in_reminder', actorName: null, place: 'Climbing' });
    expect(notificationSentence(asked)).toBe('Did you make it to Climbing? Check in');
  });
});

describe('somebody asking to join', () => {
  it('says who, and how many once there are several', () => {
    const asked = n({ kind: 'join_request', actorName: 'Maya Ruiz', place: 'NorCal SCI' });
    expect(notificationSentence(asked)).toBe('Maya Ruiz asked to join NorCal SCI');
    expect(notificationSentence({ ...asked, count: 3 })).toBe('3 people asked to join NorCal SCI');
  });
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

  // 20261029100000: a trusted partner's introduction, and both saying yes.
  it('says who would introduce the member to whom, and when it opened', () => {
    expect(
      notificationSentence(
        n({ kind: 'introduction', actorName: 'Phoebe', place: 'Maya Local', detail: 'asked' }),
      ),
    ).toBe('Phoebe would like to introduce you to Maya Local');
    expect(
      notificationSentence(
        n({ kind: 'introduction', actorName: 'Sam', place: 'Maya & Sam', detail: 'opened' }),
      ),
    ).toBe('Sam said yes: Maya & Sam is open');
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

  it('names the event an org admin told them of, and says so again on a reminder', () => {
    const told = n({ kind: 'event_notice', place: 'Swim', excerpt: 'NorCal SCI' });
    expect(notificationSentence(told)).toBe('NorCal SCI invited you to Swim. Are you going?');
    expect(notificationSentence({ ...told, detail: 'again' })).toBe(
      'Reminder from NorCal SCI: Swim. Are you going?',
    );
    expect(notificationSentence({ ...told, excerpt: null })).toBe(
      'An organization you belong to invited you to Swim. Are you going?',
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
