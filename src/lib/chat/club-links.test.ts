import { describe, expect, it } from 'vitest';
import { firstClubLink } from '@/lib/chat/club-links';

const ID = '4f9644cd-1b2a-4c3d-8e9f-0a1b2c3d4e5f';

// The owner, 2026-11-08: a link to a topic showed only "The Sci Club", and an
// event shared into a chat did not say when it was.
describe("a link to the club's own event or topic", () => {
  it('is found in a message by its page, shared link or short link, and nothing else is', () => {
    expect(
      firstClubLink(
        `This looks like a good option, see https://reeve.org and https://thesciclub.com/chat/rooms/skin/topics/${ID}`,
      ),
    ).toEqual({
      kind: 'topic',
      roomId: 'skin',
      topicId: ID,
      href: `/chat/rooms/skin/topics/${ID}`,
    });
    expect(firstClubLink(`https://thesciclub.com/events/${ID}`)).toMatchObject({ ref: ID });
    expect(
      firstClubLink('BORP picnic\nSat, Nov 14 · 10:00am\nhttps://thesciclub.com/e/borp-picnic'),
    ).toMatchObject({ kind: 'event', ref: 'borp-picnic' });
    for (const other of [
      `https://example.com/events/${ID}`,
      `https://thesciclub.com/events/${ID}/guests`,
      'https://thesciclub.com/events/organizations/x',
      'nothing here',
    ]) {
      expect(firstClubLink(other)).toBeNull();
    }
  });
});
