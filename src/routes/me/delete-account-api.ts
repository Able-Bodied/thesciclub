import { resetAttachmentUrls } from '@/lib/chat/attachments';
import { describeError, type Failure } from '@/lib/describe-error';
import { forgetThisDevice } from '@/lib/push/notifications';
import { getSupabase } from '@/lib/supabase';

/**
 * Deleting your own account, in the order that leaves nothing behind.
 *
 * 1. The profile photograph, through the Storage API, because SQL cannot
 *    delete a file (storage.protect_delete). First, and a failure stops
 *    everything: an account deleted with its face still in the bucket is the
 *    one outcome this must not have.
 * 2. This device's notifications, while there is still a session to do it
 *    with, so the phone stops being told about a club it has left.
 * 3. `delete_my_account()` (20261003080000): the sign-in account, the member
 *    row and everything hanging off it, and every invite holding the number.
 * 4. The photograph folder again, with the session still held: a profile
 *    photograph named on a report survives step 1 and is released by step 3
 *    (20261022150000). Best effort, since the account is already gone.
 * 5. The session here, locally: the account it belonged to no longer exists,
 *    so there is nothing on the server to sign out of. useAccount hears it
 *    and the guard goes to the welcome screen.
 *
 * Photographs attached to posts and messages are not touched: those stay
 * with the words, which the owner chose to keep.
 */
const DELETE_REFUSAL = {
  attempt: 'Your account was not deleted.',
  refused: 'Only you can delete your account.',
};

export async function deleteMyAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();

  const cleared = await clearPhotoFolder(userId);
  if (cleared) return { ok: false, error: describeError(cleared, DELETE_REFUSAL) };

  await forgetThisDevice();

  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, error: describeError(error, DELETE_REFUSAL) };

  await clearPhotoFolder(userId).catch(() => null);

  await supabase.auth.signOut({ scope: 'local' });
  resetAttachmentUrls();
  return { ok: true };
}

/** Every file in the member's folder that the policies let go; the error, if any. */
async function clearPhotoFolder(userId: string): Promise<Failure | null> {
  const photos = getSupabase().storage.from('photos');
  const listed = await photos.list(userId);
  if (listed.error) return listed.error;
  const paths = listed.data.map((o) => `${userId}/${o.name}`);
  if (paths.length === 0) return null;
  const removed = await photos.remove(paths);
  return removed.error;
}
