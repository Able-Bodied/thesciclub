import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import type { ChatWriteResult } from '@/lib/chat/topics';
import { announcePostViewsChanged } from '@/lib/chat/views';
import { describeError, describeThrown } from '@/lib/describe-error';
import { useKeptRead } from '@/lib/kept-reads';
import { readInBatches, readPages } from '@/lib/read-pages';
import { getSupabase } from '@/lib/supabase';

/**
 * Likes on posts in rooms: who likes which, liking, and taking it back.
 *
 * The owner, 2026-09-29 (HANDOFF.md "What Home is" decision 4): names shown to every member who
 * can read the room. `chat_post_likes` (20260930010000) is a row per member per post.
 *
 * - The count comes from the names, so the two cannot disagree. No reader filter: this read means
 *   everybody's likes (20260930010000 says why there is one select policy).
 * - Liking is `ignoreDuplicates` (on conflict do nothing): there is no update grant
 *   (HANDOFF.md, "An upsert is on conflict do update").
 * - Optimistic, put back on failure. A second tap while a write is in flight is ignored, so a like
 *   and its undo cannot land out of order.
 * - Not live: not in the realtime publication (not urgent, and names would be on the wire).
 *   Screens call `reload` when they refetch anyway.
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
 * The map with one member's like on one post set to `liked`. A new map every time; a like goes
 * at the end, where the read would put it.
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

/** "1 like", "3 likes". Zero is shown on new posts too. */
export function likesLabel(count: number): string {
  return `${count} ${count === 1 ? 'like' : 'likes'}`;
}

// From HANDOFF.md "What Home is" step 3. Unlike has no "refused": the delete policy hides
// others' rows rather than refusing.
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
  // A like is a view (20261019000000).
  announcePostViewsChanged();
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
  announcePostViewsChanged();
  return { ok: true, value: null };
}

export interface PostLikesState {
  byPost: LikesByPost;
  loading: boolean;
  /** This post's likes are not known yet. Posts the last read drew stay known. */
  loadingFor: (postId: string) => boolean;
  /** The read failed. Screens draw no count rather than a wrong one. */
  error: string | null;
  /** A like or its taking back that did not land, and which post it was on. */
  failure: { postId: string; message: string } | null;
  /** Like it, or take the like back, whichever the reader has not done. */
  toggle: (postId: string) => void;
  reload: () => void;
}

const EMPTY: LikesByPost = new Map();
const NONE: ReadonlySet<string> = new Set();

export function usePostLikes(postIds: readonly string[]): PostLikesState {
  const account = useAccount();
  const announce = useAnnounce();
  const memberId = account.status === 'member' ? account.userId : null;
  // As one string, so a new array with the same ids does not re-run the effect.
  const key = [...new Set(postIds)].sort().join(',');

  const [byPost, setByPost] = useState<LikesByPost>(EMPTY);
  // Loading is derived from this, so new posts never flash unliked before the effect runs.
  const [settled, setSettled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = memberId !== null && key !== '' && settled !== key;
  // The posts the last good read covered: drawn as they were while more load.
  const [known, setKnown] = useState<ReadonlySet<string>>(NONE);
  const [failure, setFailure] = useState<PostLikesState['failure']>(null);
  // Bumped by reload, so the effect runs again for the same ids.
  const [attempt, setAttempt] = useState(0);
  // Posts with a write in flight. A ref, not state: nothing is drawn from it.
  const pending = useRef(new Set<string>());
  // The posts whose likes are drawn; read again, they stay up meanwhile.
  const shown = useRef<string | null>(null);
  const kept = useKeptRead();

  useEffect(() => {
    // Read so biome does not flag `attempt` as an unused dependency.
    if (attempt < 0) return;
    if (!memberId || key === '') {
      shown.current = null;
      setByPost(EMPTY);
      setKnown(NONE);
      setSettled(null);
      setError(null);
      return;
    }
    // A kept tab shown again within the minute (lib/kept-reads.ts).
    const read = `${memberId}|${key}|${attempt}`;
    if (kept.fresh(read)) return;
    const landed = kept.start(read);
    const controller = new AbortController();
    const ids = key.split(',');
    const again = shown.current === key;

    async function load() {
      try {
        // Batched and paged: one read was capped at 1,000 likes and put every id in the URL.
        const { data, error: failed } = await readInBatches<LikeRow>(ids, (batch) =>
          readPages<LikeRow>((first, last) =>
            getSupabase()
              .from('chat_post_likes')
              .select('post_id, member_id')
              .in('post_id', batch)
              .order('liked_at')
              .order('post_id')
              .order('member_id')
              .range(first, last)
              .abortSignal(controller.signal),
          ),
        );
        if (controller.signal.aborted) return;
        if (failed) {
          if (again) return;
          setByPost(EMPTY);
          setKnown(NONE);
          setError(describeError(failed, 'Could not load the likes.'));
          setSettled(key);
          return;
        }
        shown.current = key;
        setByPost(groupLikes(data ?? []));
        setKnown(new Set(ids));
        setError(null);
        setSettled(key);
        landed();
      } catch (e) {
        if (controller.signal.aborted || again) return;
        setByPost(EMPTY);
        setKnown(NONE);
        setError(describeThrown(e, 'Could not load the likes.'));
        setSettled(key);
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [memberId, key, attempt, kept]);

  const toggle = useCallback(
    (postId: string) => {
      // Not before the reader's own like is known: a tap would undo it.
      if (!memberId || loading || error || pending.current.has(postId)) return;
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
    [memberId, loading, error, byPost, announce],
  );

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const loadingFor = useCallback(
    (postId: string) => loading && !known.has(postId),
    [loading, known],
  );

  return { byPost, loading, loadingFor, error: loading ? null : error, failure, toggle, reload };
}
