import { describe, expect, it } from 'vitest';
import {
  compose,
  LIKED_LENGTH,
  type Owed,
  PREVIEW_LENGTH,
  plainPost,
  shorten,
  withTag,
} from './compose.ts';

const owed = (over: Partial<Owed>): Owed => ({
  endpoint: 'https://web.push.apple.com/x',
  p256dh: 'p',
  auth: 'a',
  kind: 'direct',
  actor_name: 'Bo',
  body: 'See you Friday',
  photo_count: 0,
  subject: null,
  detail: null,
  url: '/chat/t/abc',
  tag: 'thread:abc',
  badge: null,
  ...over,
});

describe('compose', () => {
  it('says a direct message is one, who from, and what it said', () => {
    expect(compose(owed({}))).toEqual({
      title: 'Direct message from Bo',
      body: 'See you Friday',
      url: '/chat/t/abc?n=thread%3Aabc',
      tag: 'thread:abc',
    });
  });

  it('says a group message is one, who sent it, and what it said', () => {
    expect(compose(owed({ kind: 'group', body: 'Who is driving?' }))).toMatchObject({
      title: 'Group message from Bo',
      body: 'Who is driving?',
    });
  });

  // The owner, 2026-10-01: a reply says who, and what they replied, cut short.
  it('says who replied to a topic and what they said', () => {
    const reply = compose(
      owed({
        kind: 'reply',
        body: 'Try it after breakfast',
        url: '/chat/rooms/r/topics/t',
        tag: 'topic:t',
      }),
    );
    expect(reply).toEqual({
      title: 'Bo replied to your topic',
      body: 'Try it after breakfast',
      url: '/chat/rooms/r/topics/t?n=topic%3At',
      tag: 'topic:t',
    });
  });

  it('cuts a long reply short, as a message is', () => {
    const shown = compose(owed({ kind: 'reply', body: 'word '.repeat(100) }));
    expect(Array.from(shown?.body ?? '').length).toBeLessThanOrEqual(PREVIEW_LENGTH);
    expect(shown?.body.endsWith('…')).toBe(true);
  });

  it('says a reply sent a photograph when it has no words', () => {
    expect(compose(owed({ kind: 'reply', body: '', photo_count: 1 }))?.body).toBe(
      'Sent a photograph.',
    );
  });

  // An older push_owed, before 20261003000000, sends no body for a reply.
  it('falls back to who replied when no words arrive', () => {
    expect(compose(owed({ kind: 'reply', body: null }))?.body).toBe('Bo replied to your topic.');
  });

  it('cuts a long message short', () => {
    const long = 'word '.repeat(100);
    const shown = compose(owed({ body: long }));
    expect(Array.from(shown?.body ?? '').length).toBeLessThanOrEqual(PREVIEW_LENGTH);
    expect(shown?.body.endsWith('…')).toBe(true);
  });

  it('says a photograph was sent when there are no words', () => {
    expect(compose(owed({ body: '', photo_count: 1 }))?.body).toBe('Sent a photograph.');
    expect(compose(owed({ body: '', photo_count: 3 }))?.body).toBe('Sent 3 photographs.');
  });

  it('says a post was shared, without quoting it, when there is nothing else', () => {
    expect(compose(owed({ body: '', photo_count: 0 }))?.body).toBe('Shared a post.');
    expect(compose(owed({ kind: 'group', body: '', photo_count: 0 }))?.body).toBe('Shared a post.');
    expect(compose(owed({ body: 'Thought of you', photo_count: 0 }))?.body).toBe('Thought of you');
  });

  it('prefers the words when there are both', () => {
    expect(compose(owed({ body: 'Look at this', photo_count: 2 }))?.body).toBe('Look at this');
  });

  it('names somebody who has left as a member', () => {
    expect(compose(owed({ actor_name: null }))?.title).toBe('Direct message from A member');
    expect(compose(owed({ actor_name: '  ' }))?.title).toBe('Direct message from A member');
  });

  it('carries the badge to the app icon when it has one, whatever the kind', () => {
    expect(compose(owed({ badge: 3 }))?.badge).toBe(3);
    expect(compose(owed({ badge: 0 }))?.badge).toBe(0);
    expect(compose(owed({ kind: 'like', badge: 2 }))?.badge).toBe(2);
    expect(compose(owed({ kind: 'reaction', detail: 'post:👍', badge: 4 }))?.badge).toBe(4);
    expect(compose(owed({}))).not.toHaveProperty('badge');
  });

  it('says somebody replied in a topic the member posted in, and what they said', () => {
    expect(compose(owed({ kind: 'reply_participant', body: 'Same here' }))).toMatchObject({
      title: 'Bo replied in a topic you posted in',
      body: 'Same here',
    });
    expect(compose(owed({ kind: 'reply_participant', body: null }))?.body).toBe(
      'Bo replied in a topic you posted in.',
    );
  });

  // The owner, 2026-10-01: one per like, to the author, quoting their own post.
  it('says who liked a post and quotes the start of it', () => {
    expect(
      compose(
        owed({ kind: 'like', body: 'Try it after breakfast', detail: 'post', tag: 'like:p' }),
      ),
    ).toMatchObject({
      title: 'Bo liked your post',
      body: '“Try it after breakfast”',
      tag: 'like:p',
    });
  });

  it('says topic when the liked post opened the topic', () => {
    expect(
      compose(owed({ kind: 'like', body: 'Morning or evening?', detail: 'topic' }))?.title,
    ).toBe('Bo liked your topic');
  });

  it('quotes no more than the start of a long post', () => {
    const shown = compose(owed({ kind: 'like', body: 'word '.repeat(60), detail: 'post' }));
    // Two quotation marks around at most LIKED_LENGTH characters.
    expect(Array.from(shown?.body ?? '').length).toBeLessThanOrEqual(LIKED_LENGTH + 2);
    expect(shown?.body.endsWith('…”')).toBe(true);
  });

  it('says a liked photograph is one when the post has no words', () => {
    expect(compose(owed({ kind: 'like', body: '', photo_count: 1 }))?.body).toBe(
      'Your photograph.',
    );
  });

  // The owner, 2026-10-27: a reaction notifies the author, as a like does.
  it('says who reacted with what, and quotes the message', () => {
    expect(
      compose(
        owed({
          kind: 'reaction',
          body: 'See you *Friday*',
          detail: 'message:👍',
          url: '/chat/t/t1?message=m1',
          tag: 'reaction:m1',
        }),
      ),
    ).toMatchObject({
      title: 'Bo reacted 👍 to your message',
      // A message is not formatted, so its asterisks stay.
      body: '“See you *Friday*”',
      url: '/chat/t/t1?message=m1&n=reaction%3Am1',
      tag: 'reaction:m1',
    });
  });

  it('says post or topic for a reaction in a room, without the formatting', () => {
    expect(
      compose(owed({ kind: 'reaction', body: '**Bring water**', detail: 'post:❤️' })),
    ).toMatchObject({ title: 'Bo reacted ❤️ to your post', body: '“Bring water”' });
    expect(compose(owed({ kind: 'reaction', body: 'Morning?', detail: 'topic:🎉' }))?.title).toBe(
      'Bo reacted 🎉 to your topic',
    );
  });

  it('still says something for a reaction with no words or emoji', () => {
    expect(compose(owed({ kind: 'reaction', body: '', detail: 'message:' }))?.body).toBe(
      'Bo reacted to your message.',
    );
    expect(
      compose(owed({ kind: 'reaction', body: '', photo_count: 2, detail: 'post:😮' }))?.body,
    ).toBe('Your photograph.');
  });

  it('says who added the member to a group, and not which group', () => {
    expect(compose(owed({ kind: 'group_add', body: null }))).toMatchObject({
      title: 'Added to a group',
      body: 'Bo added you to a group.',
    });
  });

  // A report names nobody and quotes nothing, whatever arrives with it.
  it('says only that there is a report', () => {
    const report = compose(owed({ kind: 'report', actor_name: 'Bo', body: 'awful words' }));
    expect(report?.title).toBe('New report');
    expect(JSON.stringify(report)).not.toMatch(/Bo|awful/);
  });

  it('says who joined on an invite', () => {
    expect(compose(owed({ kind: 'invite_joined', actor_name: 'Ana', body: null }))).toMatchObject({
      title: 'Somebody you invited joined',
      body: 'Ana joined the club.',
    });
  });

  it('reminds of tomorrow’s event by name and time', () => {
    expect(
      compose(owed({ kind: 'event_reminder', subject: 'Adaptive handcycling', detail: '10:00am' })),
    ).toMatchObject({
      title: 'Tomorrow: Adaptive handcycling',
      body: "You're going. It starts at 10:00am.",
    });
  });

  it('counts new events from a followed organization', () => {
    expect(compose(owed({ kind: 'org_events', subject: 'NorCal SCI', detail: '3' }))).toMatchObject(
      {
        title: 'New from NorCal SCI',
        body: '3 new events.',
      },
    );
    expect(compose(owed({ kind: 'org_events', subject: 'NorCal SCI', detail: '1' }))?.body).toBe(
      '1 new event.',
    );
  });

  it('names the grant and when it closes', () => {
    expect(
      compose(
        owed({
          kind: 'grant_open',
          subject: 'Kelly Brush Foundation',
          body: 'Active Fund',
          detail: 'Nov 15',
        }),
      ),
    ).toMatchObject({
      title: 'Kelly Brush Foundation: applications open',
      body: 'Active Fund is open until Nov 15.',
    });
    expect(
      compose(owed({ kind: 'grant_open', subject: 'Kelly Brush Foundation', body: null })),
    ).toBeNull();
  });

  it('sends nothing for a daily kind that arrived without what it needs', () => {
    expect(compose(owed({ kind: 'event_reminder', subject: null }))).toBeNull();
    expect(compose(owed({ kind: 'org_events', subject: 'NorCal SCI', detail: 'many' }))).toBeNull();
  });

  it('reminds a member of the step left, and opens it', () => {
    expect(
      compose(
        owed({
          kind: 'profile_reminder',
          detail: 'details',
          url: '/profile/details',
          tag: 'profile:details',
        }),
      ),
    ).toMatchObject({ title: 'Finish Your details', url: '/profile/details?n=profile%3Adetails' });
    expect(
      compose(
        owed({
          kind: 'profile_reminder',
          detail: 'profile',
          url: '/profile?resume',
          tag: 'profile:profile',
        }),
      ),
    ).toMatchObject({ title: 'Finish your profile', url: '/profile?resume&n=profile%3Aprofile' });
  });

  it('counts the week’s blocks for an administrator, naming nobody', () => {
    const weekly = owed({
      kind: 'blocks_weekly',
      actor_name: null,
      body: null,
      detail: '3',
      url: '/admin?tab=reports#blocks',
      tag: 'blocks:2026-10-26',
    });
    expect(compose(weekly)).toEqual({
      title: 'Blocks this week',
      body: '3 members were blocked this week. Open Admin to see the list.',
      // The tag goes before the fragment, which the Reports tab reads.
      url: '/admin?tab=reports&n=blocks%3A2026-10-26#blocks',
      tag: 'blocks:2026-10-26',
    });
    expect(compose({ ...weekly, detail: '1' })?.body).toBe(
      '1 member was blocked this week. Open Admin to see the list.',
    );
    expect(compose({ ...weekly, detail: '0' })).toBeNull();
    expect(compose({ ...weekly, detail: null })).toBeNull();
  });

  // The owner, 2026-10-28: pressing one clears that one (20261028900000).
  it('puts the tag in the address, for the app to hand back when pressed', () => {
    expect(withTag('/events/e1', 'event:e1')).toBe('/events/e1?n=event%3Ae1');
    expect(withTag('/chat/t/t1?message=m1', 'thread:t1')).toBe(
      '/chat/t/t1?message=m1&n=thread%3At1',
    );
    expect(withTag('/admin?tab=reports#blocks', 'blocks:d')).toBe(
      '/admin?tab=reports&n=blocks%3Ad#blocks',
    );
    expect(withTag('/invites', '')).toBe('/invites');
  });

  it('sends nothing for a kind it does not know', () => {
    expect(compose(owed({ kind: 'room' }))).toBeNull();
  });
});

describe('shorten', () => {
  it('leaves a short message alone, whitespace collapsed', () => {
    expect(shorten('  See   you\nFriday  ')).toBe('See you Friday');
  });

  it('cuts at a word near the end rather than through one', () => {
    const text = `${'a'.repeat(100)} ${'b'.repeat(30)}`;
    expect(shorten(text)).toBe(`${'a'.repeat(100)}…`);
  });

  it('cuts through a word when the last space is too far back', () => {
    const text = `hi ${'b'.repeat(200)}`;
    expect(Array.from(shorten(text)).length).toBe(PREVIEW_LENGTH);
  });

  it('never splits an emoji in half', () => {
    const text = '🙂'.repeat(200);
    const shown = shorten(text);
    expect(Array.from(shown).length).toBe(PREVIEW_LENGTH);
    expect(shown).not.toContain('�');
    expect(
      Array.from(shown)
        .slice(0, -1)
        .every((c) => c === '🙂'),
    ).toBe(true);
  });
});

// 2026-10-11: a room post can be formatted; a notification is plain text.
describe('a formatted post in a notification', () => {
  it('drops the marks from a reply and keeps the words', () => {
    expect(
      compose(owed({ kind: 'reply', body: '**Gate check** it, and take the *joystick*' }))?.body,
    ).toBe('Gate check it, and take the joystick');
    expect(
      compose(owed({ kind: 'reply_participant', body: '## Tips\n- [United](https://united.com)' }))
        ?.body,
    ).toBe('Tips United');
  });

  it('drops them from the post quoted in a like', () => {
    expect(compose(owed({ kind: 'like', body: '**Bring water**' }))?.body).toBe('“Bring water”');
  });

  it('leaves a message in a conversation as typed', () => {
    expect(compose(owed({ kind: 'direct', body: 'see you at **8**' }))?.body).toBe(
      'see you at **8**',
    );
  });

  it('keeps arithmetic and snake_case', () => {
    expect(plainPost('2 * 3 * 4 and room_one_two')).toBe('2 * 3 * 4 and room_one_two');
  });
});
