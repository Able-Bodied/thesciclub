import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import type { ChatWriteResult } from '@/lib/chat/topics';
import { describeError, describeThrown } from '@/lib/describe-error';
import { readPages } from '@/lib/read-pages';
import { getSupabase } from '@/lib/supabase';

/**
 * Saved topics and posts (20261020030000): private to the member who saved
 * them. A null post is the topic itself. Optimistic like likes.ts, with a
 * second tap ignored while a write is in flight.
 */

interface SaveRow {
  topic_id: string;
  post_id: string | null;
}

/** One key per topic save and per post save. */
export function saveKey(topicId: string, postId: string | null): string {
  return postId ? `${topicId}:${postId}` : topicId;
}

const SAVE_FAILED = { attempt: 'This was not saved.', refused: 'You cannot save this.' };
const UNSAVE_FAILED = { attempt: 'This is still saved.' };

export async function saveItem(
  memberId: string,
  topicId: string,
  postId: string | null,
): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase()
    .from('chat_saves')
    .upsert(
      { member_id: memberId, topic_id: topicId, post_id: postId },
      { onConflict: 'member_id,topic_id,post_id', ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: describeError(error, SAVE_FAILED) };
  return { ok: true, value: null };
}

export async function unsaveItem(
  memberId: string,
  topicId: string,
  postId: string | null,
): Promise<ChatWriteResult<null>> {
  const query = getSupabase()
    .from('chat_saves')
    .delete()
    .eq('member_id', memberId)
    .eq('topic_id', topicId);
  const { error } = await (postId ? query.eq('post_id', postId) : query.is('post_id', null));
  if (error) return { ok: false, error: describeError(error, UNSAVE_FAILED) };
  return { ok: true, value: null };
}

export interface SavesState {
  saved: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  /** A save or unsave that did not land, by its saveKey. */
  failure: { key: string; message: string } | null;
  toggle: (topicId: string, postId: string | null) => void;
}

const EMPTY: ReadonlySet<string> = new Set();

/** The reader's saves in one topic. */
export function useTopicSaves(topicId: string | undefined): SavesState {
  const account = useAccount();
  const announce = useAnnounce();
  const memberId = account.status === 'member' ? account.userId : null;
  const [saved, setSaved] = useState<ReadonlySet<string>>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<SavesState['failure']>(null);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (!memberId || !topicId) {
      setSaved(EMPTY);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    async function load(topic: string) {
      try {
        const { data, error: failed } = await readPages<SaveRow>((first, last) =>
          getSupabase()
            .from('chat_saves')
            .select('topic_id, post_id')
            .eq('topic_id', topic)
            .order('post_id', { nullsFirst: true })
            .range(first, last)
            .abortSignal(controller.signal),
        );
        if (controller.signal.aborted) return;
        if (failed) {
          setError(describeError(failed, 'Could not load what you saved.'));
        } else {
          setSaved(new Set((data ?? []).map((row) => saveKey(row.topic_id, row.post_id))));
          setError(null);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(describeThrown(e, 'Could not load what you saved.'));
      }
      setLoading(false);
    }
    void load(topicId);
    return () => {
      controller.abort();
    };
  }, [memberId, topicId]);

  const toggle = useCallback(
    (topic: string, postId: string | null) => {
      const key = saveKey(topic, postId);
      if (!memberId || pending.current.has(key)) return;
      const was = saved.has(key);
      const set = (on: boolean) => {
        setSaved((current) => {
          const next = new Set(current);
          if (on) next.add(key);
          else next.delete(key);
          return next;
        });
      };
      pending.current.add(key);
      setFailure(null);
      set(!was);
      const done = (message: string | null) => {
        pending.current.delete(key);
        if (message === null) {
          announce(was ? 'Removed from Saved.' : 'Saved.');
          return;
        }
        set(was);
        setFailure({ key, message });
      };
      const write = was ? unsaveItem(memberId, topic, postId) : saveItem(memberId, topic, postId);
      void write
        .then((result) => {
          done(result.ok ? null : result.error);
        })
        .catch((e: unknown) => {
          done(describeThrown(e, was ? UNSAVE_FAILED : SAVE_FAILED));
        });
    },
    [memberId, saved, announce],
  );

  return { saved, loading, error, failure, toggle };
}

/** One row of the Saved page. A null topic or post is one the reader can no longer read. */
export interface SavedItem {
  topicId: string;
  postId: string | null;
  savedAt: string;
  topic: { title: string; roomId: string } | null;
  post: { body: string; authorId: string | null; removed: boolean } | null;
}

export interface SavedRow extends SaveRow {
  saved_at: string;
  topic: { title: string; room_id: string } | null;
  post: { body: string; author_id: string | null; removed_at: string | null } | null;
}

export function toSavedItem(row: SavedRow): SavedItem {
  return {
    topicId: row.topic_id,
    postId: row.post_id,
    savedAt: row.saved_at,
    topic: row.topic ? { title: row.topic.title, roomId: row.topic.room_id } : null,
    post: row.post
      ? {
          body: row.post.body,
          authorId: row.post.author_id,
          removed: row.post.removed_at !== null,
        }
      : null,
  };
}

/** Everything the reader saved, newest first. */
export function useSavedItems() {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt < 0) return;
    if (!memberId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    async function load() {
      try {
        const { data, error: failed } = await readPages<SavedRow>((first, last) =>
          getSupabase()
            .from('chat_saves')
            .select(
              'topic_id, post_id, saved_at, topic:chat_topics(title, room_id), post:chat_posts(body, author_id, removed_at)',
            )
            .order('saved_at', { ascending: false })
            .order('topic_id')
            .order('post_id', { nullsFirst: true })
            .range(first, last)
            .abortSignal(controller.signal)
            .overrideTypes<SavedRow[], { merge: false }>(),
        );
        if (controller.signal.aborted) return;
        if (failed) {
          setError(describeError(failed, 'Could not load what you saved.'));
        } else {
          setItems((data ?? []).map(toSavedItem));
          setError(null);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(describeThrown(e, 'Could not load what you saved.'));
      }
      setLoading(false);
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [memberId, attempt]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  /** Take one off the list at once; put it back if the delete fails. */
  const remove = useCallback(
    async (item: SavedItem): Promise<string | null> => {
      if (!memberId) return 'You are signed out.';
      const key = saveKey(item.topicId, item.postId);
      const others = (list: SavedItem[]) =>
        list.filter((each) => saveKey(each.topicId, each.postId) !== key);
      setItems(others);
      try {
        const result = await unsaveItem(memberId, item.topicId, item.postId);
        if (result.ok) return null;
        setItems((list) => [...others(list), item].sort(newestFirst));
        return result.error;
      } catch (e) {
        setItems((list) => [...others(list), item].sort(newestFirst));
        return describeThrown(e, UNSAVE_FAILED);
      }
    },
    [memberId],
  );

  return { items, loading, error, reload, remove };
}

function newestFirst(a: SavedItem, b: SavedItem): number {
  return b.savedAt.localeCompare(a.savedAt);
}
