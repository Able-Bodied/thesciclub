import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import type { ChatEdit } from '@/lib/chat/types';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Every earlier version of an edited post or message, for an administrator.
 *
 * `chat_edits` has one select policy, `is_admin()`, and select is granted to
 * `authenticated` (20260930000000). So a member's read would come back
 * empty rather than refused — and this hook does not make it: for anybody
 * who is not an administrator it answers with empty maps without asking,
 * because a read that will return nothing is still a round trip on a phone,
 * and because a screen that reads chat_edits for a member is a screen that
 * has forgotten who the table is for.
 *
 * One read for every id the screen has, keyed so that a second render with
 * the same ids does not ask again. `reload` is for the moment an
 * administrator's own edit lands, and for the topic page's realtime refetch;
 * an edit by somebody else arrives on the wire as an update to the post,
 * and the page reloads both.
 */
export interface EditsState {
  /** Earlier versions by post id, oldest first. */
  byPost: Map<string, ChatEdit[]>;
  /** Earlier versions by message id, oldest first. */
  byMessage: Map<string, ChatEdit[]>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface EditRow {
  id: string;
  post_id: string | null;
  message_id: string | null;
  body: string;
  attachments: string[] | null;
  edited_by: string | null;
  replaced_at: string;
}

const EDIT_COLUMNS = 'id, post_id, message_id, body, attachments, edited_by, replaced_at';

function toEdit(row: EditRow): ChatEdit {
  return {
    id: row.id,
    postId: row.post_id,
    messageId: row.message_id,
    body: row.body,
    attachments: row.attachments ?? [],
    editedBy: row.edited_by,
    replacedAt: row.replaced_at,
  };
}

/** The rows grouped by the id they belong to, in the order they were read. */
export function groupEdits(edits: readonly ChatEdit[]): {
  byPost: Map<string, ChatEdit[]>;
  byMessage: Map<string, ChatEdit[]>;
} {
  const byPost = new Map<string, ChatEdit[]>();
  const byMessage = new Map<string, ChatEdit[]>();
  for (const edit of edits) {
    const into = edit.postId ? byPost : byMessage;
    const id = edit.postId ?? edit.messageId;
    if (!id) continue;
    const list = into.get(id);
    if (list) list.push(edit);
    else into.set(id, [edit]);
  }
  return { byPost, byMessage };
}

const EMPTY = { byPost: new Map<string, ChatEdit[]>(), byMessage: new Map<string, ChatEdit[]>() };

export function useEdits(postIds: readonly string[], messageIds: readonly string[]): EditsState {
  const account = useAccount();
  const isAdmin = account.status === 'member' && account.isAdmin;
  // The ids as one string, so the effect re-runs when the set changes and
  // not when the caller builds a new array with the same ids in it.
  const postKey = [...postIds].sort().join(',');
  const messageKey = [...messageIds].sort().join(',');

  const [grouped, setGrouped] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by reload, so the effect runs again for the same ids.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Read, not only depended on: biome counts an unread dependency as a
    // spare one, and a re-run for the same ids is the whole point of it.
    if (attempt < 0) return;
    if (!isAdmin || (postKey === '' && messageKey === '')) {
      setGrouped(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const posts = postKey === '' ? [] : postKey.split(',');
    const messages = messageKey === '' ? [] : messageKey.split(',');
    setLoading(true);

    async function load() {
      try {
        let query = getSupabase().from('chat_edits').select(EDIT_COLUMNS);
        // PostgREST's `in` takes a parenthesised list; `or` joins two of them.
        if (posts.length > 0 && messages.length > 0) {
          query = query.or(`post_id.in.(${posts.join(',')}),message_id.in.(${messages.join(',')})`);
        } else if (posts.length > 0) {
          query = query.in('post_id', posts);
        } else {
          query = query.in('message_id', messages);
        }
        const { data, error: failure } = (await query
          .order('replaced_at')
          .abortSignal(controller.signal)) as { data: EditRow[] | null; error: Failure | null };
        if (controller.signal.aborted) return;
        if (failure) {
          setGrouped(EMPTY);
          setError(describeError(failure, 'Could not load the earlier versions.'));
          setLoading(false);
          return;
        }
        setGrouped(groupEdits((data ?? []).map(toEdit)));
        setError(null);
        setLoading(false);
      } catch (e) {
        if (controller.signal.aborted) return;
        setGrouped(EMPTY);
        setError(describeThrown(e, 'Could not load the earlier versions.'));
        setLoading(false);
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [isAdmin, postKey, messageKey, attempt]);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return { byPost: grouped.byPost, byMessage: grouped.byMessage, loading, error, reload };
}
