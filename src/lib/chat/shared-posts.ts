import { useEffect, useState } from 'react';
import { openDirect, sendMessage } from '@/lib/chat/threads';
import { describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * A post shared into a conversation (the owner, 2026-10-25).
 *
 * The message holds only the post's id. What the card shows is read live,
 * by `chat_shared_posts`, with the reader's own rights: a post in a room they
 * cannot read, removed, deleted, or across a block either way comes back as
 * nothing, and the card says it isn't available (20261025010000).
 */
export interface SharedPost {
  postId: string;
  topicId: string;
  roomId: string;
  roomName: string;
  topicTitle: string;
  /** The topic's first post, which the card names by the topic's title. */
  opening: boolean;
  /** Null for a deleted member. */
  authorId: string | null;
  /** The start of the words, as written (small Markdown). */
  body: string;
  photoPath: string | null;
  createdAt: string;
}

interface SharedPostRow {
  message_id: string;
  post_id: string;
  topic_id: string;
  room_id: string;
  room_name: string;
  topic_title: string;
  opening: boolean;
  author_id: string | null;
  body: string;
  photo_path: string | null;
  created_at: string;
}

function toSharedPost(row: SharedPostRow): SharedPost {
  return {
    postId: row.post_id,
    topicId: row.topic_id,
    roomId: row.room_id,
    roomName: row.room_name,
    topicTitle: row.topic_title,
    opening: row.opening,
    authorId: row.author_id,
    body: row.body,
    photoPath: row.photo_path,
    createdAt: row.created_at,
  };
}

/** Where tapping the card goes: the topic, on the post unless it is the first. */
export function sharedPostPath(post: SharedPost): string {
  const topic = `/chat/rooms/${post.roomId}/topics/${post.topicId}`;
  return post.opening ? topic : `${topic}?post=${post.postId}`;
}

export interface SharedPostsState {
  /** By message id. A message read and missing here has no card for this reader. */
  cards: Map<string, SharedPost>;
  /** The message ids the last read answered for. */
  answered: ReadonlySet<string>;
}

const NOTHING: SharedPostsState = { cards: new Map(), answered: new Set() };

/**
 * The cards for these messages, read again whenever `again` changes (the
 * conversation's reload), so a post removed or a member blocked meanwhile
 * turns into "isn't available". The cards on screen stay until then.
 */
export function useSharedPosts(messageIds: readonly string[], again?: unknown): SharedPostsState {
  const key = [...new Set(messageIds)].sort().join(',');
  const [state, setState] = useState<SharedPostsState>(NOTHING);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `again` is only a trigger to read again.
  useEffect(() => {
    if (!key) {
      setState(NOTHING);
      return;
    }
    const controller = new AbortController();
    const ids = key.split(',');
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc('chat_shared_posts', { message_ids: ids })
          .abortSignal(controller.signal)) as { data: SharedPostRow[] | null; error: unknown };
        if (controller.signal.aborted) return;
        // A failed read is not "unavailable": leave those cards loading.
        if (error) return;
        setState({
          cards: new Map((data ?? []).map((row) => [row.message_id, toSharedPost(row)])),
          answered: new Set(ids),
        });
      } catch {
        // Offline or aborted; the next change reads again.
      }
    })();
    return () => {
      controller.abort();
    };
  }, [key, again]);

  return state;
}

/** Where to share: a conversation the member is in, or a member to start one with. */
export type ShareTarget = { threadId: string } | { memberId: string };

export type ShareResult = { ok: true; threadId: string } | { ok: false; error: string };

/**
 * Send a post into a conversation, with an optional line. The database
 * decides whether it may go: only into a conversation the sender is in, not
 * to a blocked member, and only a post the sender can see.
 */
export async function sharePost(
  postId: string,
  target: ShareTarget,
  authorId: string,
  line: string,
): Promise<ShareResult> {
  try {
    let threadId: string;
    if ('memberId' in target) {
      const opened = await openDirect(target.memberId);
      if (!opened.ok) return opened;
      threadId = opened.value;
    } else {
      threadId = target.threadId;
    }
    const sent = await sendMessage(threadId, authorId, line.trim(), [], null, postId);
    if (!sent.ok) return sent;
    return { ok: true, threadId };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'The post was not shared.') };
  }
}
