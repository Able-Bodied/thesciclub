import { describe, expect, it } from 'vitest';
import { compose, type Owed, PREVIEW_LENGTH, shorten } from './compose.ts';

const owed = (over: Partial<Owed>): Owed => ({
  endpoint: 'https://web.push.apple.com/x',
  p256dh: 'p',
  auth: 'a',
  kind: 'direct',
  author_name: 'Bo',
  body: 'See you Friday',
  photo_count: 0,
  url: '/chat/t/abc',
  tag: 'thread:abc',
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

  // The owner's rule: a reply says who, and nothing of what.
  it('says who replied to a topic and nothing else', () => {
    const reply = compose(
      owed({ kind: 'reply', body: null, url: '/chat/rooms/r/topics/t', tag: 'topic:t' }),
    );
    expect(reply).toEqual({
      title: 'Reply to your topic',
      body: 'Bo replied to your topic.',
      url: '/chat/rooms/r/topics/t',
      tag: 'topic:t',
    });
  });

  // push_owed never sends a reply's words; if it ever did, they still must
  // not reach a lock screen.
  it('drops a reply’s words even if they arrive', () => {
    const reply = compose(owed({ kind: 'reply', body: 'A private answer about a private thing' }));
    expect(JSON.stringify(reply)).not.toContain('private');
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
    expect(compose(owed({ author_name: null }))?.title).toBe('Direct message from A member');
    expect(compose(owed({ author_name: '  ' }))?.title).toBe('Direct message from A member');
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
