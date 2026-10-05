import { attachmentFolder, CHAT_BUCKET } from '@/lib/chat/attachments';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Deleting a conversation whose other member has deleted their account
 * (20261005000000), in the order that leaves nothing behind.
 *
 * 1. Every photograph in the conversation's folder, through the Storage API,
 *    because SQL cannot delete a file. First, because the storage API deletes
 *    only what the caller can read, and once the conversation is gone nobody
 *    can read its files. The folder rather than the messages: it also holds
 *    the pictures of messages taken back, which the client never sees, and
 *    anything uploaded for a message that was never written. A photograph a
 *    report names is refused by the policy and stays with the report; that
 *    is not a failure.
 * 2. `chat_delete_conversation()`: the conversation, every message in it from
 *    both of them, and everything hanging off those.
 *
 * A failure in 1 stops everything, so a conversation is never deleted with
 * pictures left behind that nobody could then reach.
 */
const DELETE_REFUSAL = {
  attempt: 'The conversation was not deleted.',
  refused: 'Only a conversation with a deleted member can be deleted.',
};

/** The storage API's own page size; a folder longer than this takes several. */
const PAGE = 1000;

export async function deleteConversation(
  threadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  const storage = supabase.storage.from(CHAT_BUCKET);
  const folder = attachmentFolder('thread', threadId);

  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const listed = await storage.list(folder, { limit: PAGE, offset });
    if (listed.error) return { ok: false, error: describeError(listed.error, DELETE_REFUSAL) };
    paths.push(...listed.data.map((o) => `${folder}/${o.name}`));
    if (listed.data.length < PAGE) break;
  }
  if (paths.length > 0) {
    const removed = await storage.remove(paths);
    if (removed.error) return { ok: false, error: describeError(removed.error, DELETE_REFUSAL) };
  }

  const { error } = await supabase.rpc('chat_delete_conversation', { thread: threadId });
  if (error) return { ok: false, error: describeError(error, DELETE_REFUSAL) };
  return { ok: true };
}
