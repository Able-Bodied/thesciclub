import { useEffect, useState } from 'react';
import { clubPath } from '@/components/linked-text';
import { describeError, describeThrown } from '@/lib/describe-error';
import { fetchEventIdByShortLink } from '@/lib/event-audience';
import { findLinks } from '@/lib/links';
import { markdownToPlain } from '@/lib/markdown';
import { getSupabase } from '@/lib/supabase';
import type { RsvpStatus } from '@/types/domain';

/**
 * A link to the club's own event or topic, drawn from the club's own data
 * (the owner, 2026-11-08): an event shared into a chat says when it is and
 * has its RSVP there, and a topic says what it is about. The page fetched
 * for an ordinary link's card only ever said "The Sci Club", since every
 * page in it is for members.
 *
 * Read with the reader's own rights, so a card shows nothing they could not
 * open. Nothing new in the database: a store app that has not updated keeps
 * the plain link.
 */
export type ClubLink =
  /** `ref` is the event's id, or its short link (/e/…). */
  | { kind: 'event'; ref: string; href: string }
  | { kind: 'topic'; roomId: string; topicId: string; href: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const EVENT_PATH = new RegExp(`^/events/(${UUID})/?$`, 'i');
/** The link Share sends: thesciclub.com/e/ and its short link or id. */
const PUBLIC_EVENT_PATH = /^\/e\/([a-z0-9][a-z0-9-]{0,62})\/?$/i;
export const IS_UUID = new RegExp(`^${UUID}$`, 'i');
const TOPIC_PATH = new RegExp(`^/chat/rooms/([a-z0-9_-]+)/topics/(${UUID})/?$`, 'i');

export function toClubLink(href: string): ClubLink | null {
  const path = clubPath(href)?.replace(/[?#].*$/, '');
  if (!path) return null;
  const event = EVENT_PATH.exec(path);
  if (event?.[1]) return { kind: 'event', ref: event[1].toLowerCase(), href: path };
  const shared = PUBLIC_EVENT_PATH.exec(path);
  if (shared?.[1]) return { kind: 'event', ref: shared[1].toLowerCase(), href: path };
  const topic = TOPIC_PATH.exec(path);
  if (topic?.[1] && topic[2]) {
    return { kind: 'topic', roomId: topic[1], topicId: topic[2].toLowerCase(), href: path };
  }
  return null;
}

/** The first link in the words that is the club's own event or topic. */
export function firstClubLink(text: string | null | undefined): ClubLink | null {
  if (!text) return null;
  for (const piece of findLinks(text)) {
    if (piece.kind !== 'link') continue;
    const found = toClubLink(piece.href);
    if (found) return found;
  }
  return null;
}

export interface ClubTopic {
  id: string;
  roomId: string;
  title: string;
  roomName: string | null;
  /** The opening post's words, plain, or null if it was removed. */
  opening: string | null;
  replyCount: number;
}

export type ClubTopicState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; error: string }
  | { status: 'ready'; topic: ClubTopic };

interface TopicRow {
  id: string;
  room_id: string;
  title: string;
  reply_count: number | null;
  chat_rooms: { name: string | null } | null;
  opening: { body: string | null; removed_at: string | null }[] | null;
}

/** One topic, its room's name and its opening words. */
export function useClubTopic(topicId: string | null): ClubTopicState {
  const [state, setState] = useState<ClubTopicState>({ status: 'loading' });
  useEffect(() => {
    if (!topicId) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        const { data, error } = await getSupabase()
          .from('chat_topics')
          .select(
            'id, room_id, title, reply_count, chat_rooms(name), opening:chat_posts(body, removed_at)',
          )
          .eq('id', topicId)
          .order('created_at', { referencedTable: 'opening' })
          .order('id', { referencedTable: 'opening' })
          .limit(1, { referencedTable: 'opening' })
          .abortSignal(controller.signal)
          .maybeSingle();
        if (controller.signal.aborted) return;
        if (error) {
          setState({ status: 'failed', error: describeError(error, 'Could not read the topic.') });
          return;
        }
        const row = data as unknown as TopicRow | null;
        if (!row) {
          setState({ status: 'missing' });
          return;
        }
        const first = row.opening?.[0];
        const words = first && !first.removed_at && first.body ? markdownToPlain(first.body) : '';
        setState({
          status: 'ready',
          topic: {
            id: row.id,
            roomId: row.room_id,
            title: row.title,
            roomName: row.chat_rooms?.name ?? null,
            opening: words.trim() === '' ? null : words.trim(),
            replyCount: row.reply_count ?? 0,
          },
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        setState({ status: 'failed', error: describeThrown(e, 'Could not read the topic.') });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [topicId]);
  return state;
}

/** The event's id from a link's id or short link; undefined while read, null if none. */
export function useEventIdOf(ref: string): string | null | undefined {
  const direct = IS_UUID.test(ref) ? ref : null;
  const [found, setFound] = useState<{ ref: string; id: string | null } | null>(null);
  useEffect(() => {
    if (direct) return;
    let cancelled = false;
    void fetchEventIdByShortLink(ref).then((result) => {
      if (!cancelled) setFound({ ref, id: result.ok ? result.value : null });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, direct]);
  if (direct) return direct;
  return found?.ref === ref ? found.id : undefined;
}

/** The reader's own answer to one event; undefined while it is read. */
export function useOwnRsvp(
  eventId: string | null,
  memberId: string | null,
): { status: RsvpStatus | null | undefined; set: (next: RsvpStatus | null) => void } {
  const [status, setStatus] = useState<RsvpStatus | null | undefined>(undefined);
  useEffect(() => {
    if (!eventId || !memberId) {
      setStatus(null);
      return;
    }
    const controller = new AbortController();
    void getSupabase()
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('member_id', memberId)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const said: unknown = data?.status;
        setStatus(said === 'going' || said === 'interested' ? said : null);
      });
    return () => {
      controller.abort();
    };
  }, [eventId, memberId]);
  return { status, set: setStatus };
}
