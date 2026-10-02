import { describe, expect, it } from 'vitest';
import { compose, type Owed, PREVIEW_LENGTH, shorten } from './compose.ts';

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
      url: '/chat/t/abc',
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
      url: '/chat/rooms/r/topics/t',
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

  it('prefers the words when there are both', () => {
    expect(compose(owed({ body: 'Look at this', photo_count: 2 }))?.body).toBe('Look at this');
  });

  it('names somebody who has left as a member', () => {
    expect(compose(owed({ actor_name: null }))?.title).toBe('Direct message from A member');
    expect(compose(owed({ actor_name: '  ' }))?.title).toBe('Direct message from A member');
  });

  it('carries the unread count to the app badge when it has one', () => {
    expect(compose(owed({ badge: 3 }))?.badge).toBe(3);
    expect(compose(owed({ badge: 0 }))?.badge).toBe(0);
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

  it('sends nothing for a daily kind that arrived without what it needs', () => {
    expect(compose(owed({ kind: 'event_reminder', subject: null }))).toBeNull();
    expect(compose(owed({ kind: 'org_events', subject: 'NorCal SCI', detail: 'many' }))).toBeNull();
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
