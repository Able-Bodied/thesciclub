import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import type { ChatWriteResult } from '@/lib/chat/topics';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Likes on posts in rooms: who likes which, liking, and taking it back.
 *
 * The owner, 2026-09-29 (HANDOFF.md "What Home is" decision 4): likes, with names shown to
 * every member who can read the room. `chat_post_likes` (20260930010000)
 * holds a row per member per post and nothing else.
 *
 * ---------------------------------------------------------------------------
 * One read, and the count comes from the names
 * ---------------------------------------------------------------------------
 * `post_id, member_id` for the posts on screen. The count beside a Like
 * button and the list the count opens are the same rows, so they cannot
 * disagree — a count kept anywhere else would be a second number that can.
 * The select policy already lets a reader of the room see every row, so no
 * counts view is needed.
 *
 * No filter on the reader here, on purpose: this read *means* everybody's
 * likes. The table has one select policy, and 20260930010000 says why a
 * second one would need every "mine" read to say so; there is no "mine" read.
 *
 * ---------------------------------------------------------------------------
 * Liking is an insert that ignores a duplicate; taking it back is a delete
 * ---------------------------------------------------------------------------
 * `ignoreDuplicates` is `on conflict do nothing`, which needs only the insert
 * grant. There is no update grant on this table, so an upsert that updates
 * would be refused — HANDOFF.md, "An upsert is on conflict do update". A
 * second tap that lands before the first is one row either way.
 *
 * ---------------------------------------------------------------------------
 * Optimistic, and put back if it fails
 * ---------------------------------------------------------------------------
 * The button moves before the write lands, the way following an
 * organization does and joining a room did. A like is a one-tap opinion;
 * making somebody watch a spinner for it costs more than it is worth, and
 * the failure case is a button that returns to where it was with a sentence
 * under the post. While a post's write is in flight a second tap on it is
 * ignored, so that a like and its taking back cannot reach the database in
 * the wrong order and leave the screen saying the opposite of the table.
 *
 * ---------------------------------------------------------------------------
 * Not live
 * ---------------------------------------------------------------------------
 * The table is not in the realtime publication (a like is not urgent, and
 * the names would be on the wire). Screens call `reload` when they refetch
 * for another reason — the topic page does when a post arrives.
 */

/** Who likes each post: member ids, oldest like first. Posts nobody likes are absent. */
export type LikesByPost = ReadonlyMap<string, readonly string[]>;

export interface LikeRow {
  post_id: string;
  member_id: string;
}

/** The rows grouped by post, in the order they were read. */
export function groupLikes(rows: readonly LikeRow[]): Map<string, string[]> {
  const byPost = new Map<string, string[]>();
  for (const row of rows) {
    const list = byPost.get(row.post_id);
    if (list) {
      if (!list.includes(row.member_id)) list.push(row.member_id);
    } else {
      byPost.set(row.post_id, [row.member_id]);
    }
  }
  return byPost;
}

/**
 * The map with one member's like on one post set to `liked`. Pure, and a new
 * map every time, so React sees the change. A like goes at the end, which is
 * where the read would put it.
 */
export function withLike(
  byPost: LikesByPost,
  postId: string,
  memberId: string,
  liked: boolean,
): Map<string, readonly string[]> {
  const next = new Map(byPost);
  const current = byPost.get(postId) ?? [];
  const without = current.filter((id) => id !== memberId);
  const list = liked ? [...without, memberId] : without;
  if (list.length > 0) next.set(postId, list);
  else next.delete(postId);
  return next;
}

/** "1 like", "3 likes". Never called with zero: a count of zero is not drawn. */
export function likesLabel(count: number): string {
  return `${count} ${count === 1 ? 'like' : 'likes'}`;
}

// The sentences are the plan's (HANDOFF.md "What Home is" step 3), except the one for
// taking a like back, which it did not write. That one has no "refused": the
// delete policy hides somebody else's row rather than refusing it, so the
// only failures are the ones describeError sorts by itself.
const LIKE_FAILED = { attempt: 'Your like was not saved.', refused: 'You cannot like this.' };
const UNLIKE_FAILED = { attempt: 'Your like is still there.' };

/** Like a post, as the reader. Liking twice is one row. */
export async function likePost(postId: string, memberId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase()
    .from('chat_post_likes')
    .upsert(
      { post_id: postId, member_id: memberId },
      { onConflict: 'post_id,member_id', ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: describeError(error, LIKE_FAILED) };
  return { ok: true, value: null };
}

/** Take the reader's like back. Taking back one that is not there is not an error. */
export async function unlikePost(postId: string, memberId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase()
    .from('chat_post_likes')
    .delete()
    .eq('post_id', postId)
    .eq('member_id', memberId);
  if (error) return { ok: false, error: describeError(error, UNLIKE_FAILED) };
  return { ok: true, value: null };
}

export interface PostLikesState {
  byPost: LikesByPost;
  loading: boolean;
  /** The read failed. Screens draw no count rather than a wrong one. */
  error: string | null;
  /** A like or its taking back that did not land, and which post it was on. */
  failure: { postId: string; message: string } | null;
  /** Like it, or take the like back, whichever the reader has not done. */
  toggle: (postId: string) => void;
  reload: () => void;
}

const EMPTY: LikesByPost = new Map();

export function usePostLikes(postIds: readonly string[]): PostLikesState {
  const account = useAccount();
  const announce = useAnnounce();
  const memberId = account.status === 'member' ? account.userId : null;
  // The ids as one string, so the effect re-runs when the set changes and not
  // when the caller builds a new array with the same ids in it.
  const key = [...new Set(postIds)].sort().join(',');

  const [byPost, setByPost] = useState<LikesByPost>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<PostLikesState['failure']>(null);
  // Bumped by reload, so the effect runs again for the same ids.
  const [attempt, setAttempt] = useState(0);
  // Posts with a write in flight. A ref, not state: nothing is drawn from it.
  const pending = useRef(new Set<string>());

  useEffect(() => {
    // Read, not only depended on: biome counts an unread dependency as a
    // spare one, and a re-run for the same ids is the whole point of it.
    if (attempt < 0) return;
    if (!memberId || key === '') {
      setByPost(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const ids = key.split(',');
    setLoading(true);

    async function load() {
      try {
        const { data, error: failed } = (await getSupabase()
          .from('chat_post_likes')
          .select('post_id, member_id')
          .in('post_id', ids)
          .order('liked_at')
          .abortSignal(controller.signal)) as { data: LikeRow[] | null; error: Failure | null };
        if (controller.signal.aborted) return;
        if (failed) {
          setByPost(EMPTY);
          setError(describeError(failed, 'Could not load the likes.'));
          setLoading(false);
          return;
        }
        setByPost(groupLikes(data ?? []));
        setError(null);
        setLoading(false);
      } catch (e) {
        if (controller.signal.aborted) return;
        setByPost(EMPTY);
        setError(describeThrown(e, 'Could not load the likes.'));
        setLoading(false);
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [memberId, key, attempt]);

  const toggle = useCallback(
    (postId: string) => {
      if (!memberId || pending.current.has(postId)) return;
      const wasLiked = (byPost.get(postId) ?? []).includes(memberId);
      pending.current.add(postId);
      setFailure(null);
      setByPost((current) => withLike(current, postId, memberId, !wasLiked));

      const done = (message: string | null) => {
        pending.current.delete(postId);
        if (message === null) {
          // The thumb moved before the write; this says the write held.
          announce(wasLiked ? 'Like taken back.' : 'Liked.');
          return;
        }
        setByPost((current) => withLike(current, postId, memberId, wasLiked));
        setFailure({ postId, message });
      };

      const write = wasLiked ? unlikePost(postId, memberId) : likePost(postId, memberId);
      void write
        .then((result) => {
          done(result.ok ? null : result.error);
        })
        .catch((e: unknown) => {
          done(describeThrown(e, wasLiked ? UNLIKE_FAILED : LIKE_FAILED));
        });
    },
    [memberId, byPost, announce],
  );

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return { byPost, loading, error, failure, toggle, reload };
}
