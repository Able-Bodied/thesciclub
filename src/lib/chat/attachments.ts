import { useEffect, useState } from 'react';
import { preparePhoto } from '@/lib/image';
import { getSupabase } from '@/lib/supabase';

/**
 * Photographs on a message or a post.
 *
 * ---------------------------------------------------------------------------
 * The limits, and where each one is enforced
 * ---------------------------------------------------------------------------
 * The owner's, 2026-09-21: photographs yes, video no, four at most, shrunk on
 * the phone before they go anywhere. Each limit is held in two places so that
 * a bypassed client is still held to it:
 *
 *   four per message     here, and `cardinality(attachments) <= 4` on the row
 *   images only          here (`image/*`), and the bucket's allowed types
 *   10MB before reading  here — the file is refused before `createImageBitmap`
 *                        is asked to decode something that would take a phone
 *                        a minute; the bucket's own limit is 2MB, which is
 *                        after the shrink
 *   1,600px webp         `preparePhoto`, at a longer edge than a profile
 *                        picture gets, because what people share here is a
 *                        cushion, a catheter set-up, a wound — the detail is
 *                        the point
 *
 * ---------------------------------------------------------------------------
 * The bucket is private, so every URL is signed and short-lived
 * ---------------------------------------------------------------------------
 * There is no public URL for a chat photograph and there must never be — see
 * 20260918200000. `useAttachmentUrls` asks storage for a signed URL under the
 * member's own token, which storage grants only if the select policy would
 * let them read the file. The URLs are cached for a little under their hour so
 * that scrolling a conversation does not re-sign every picture on every
 * render, and dropped before they expire so that a stale one is never drawn.
 *
 * ---------------------------------------------------------------------------
 * Upload first, then the row; delete what was uploaded if the row is refused
 * ---------------------------------------------------------------------------
 * The row names the paths, so the files have to exist first. If the insert is
 * then refused — the room closed, the membership paused — the files are
 * removed again rather than left as orphans nobody's message points at. A
 * file that outlives a failed delete is still behind the read policy, so the
 * cost is bytes, not disclosure.
 */

export const CHAT_BUCKET = 'chat';
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_EDGE = 1600;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** Not quite the hour storage signs for, so nothing is drawn on its last second. */
const SIGNED_FOR_SECONDS = 3600;
const CACHE_FOR_MS = 50 * 60 * 1000;

export type AttachmentResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Why these files cannot be attached, in a sentence, or null when they can.
 * Pure, so the composer's test can hold it to each limit.
 */
export function attachmentProblem(files: File[], alreadyAttached: number): string | null {
  if (files.length === 0) return null;
  if (alreadyAttached + files.length > MAX_ATTACHMENTS) {
    return `Up to ${MAX_ATTACHMENTS} photographs on one message.`;
  }
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return `${file.name || 'That file'} is not a photograph. Photographs only — a video can be linked.`;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      return `${file.name || 'That photograph'} is over 10MB. Try a smaller one.`;
    }
  }
  return null;
}

/** `threads/<thread_id>` or `rooms/<room_id>` — the folder the read policy checks. */
export function attachmentFolder(kind: 'thread' | 'room', id: string): string {
  return kind === 'thread' ? `threads/${id}` : `rooms/${id}`;
}

/**
 * Shrink and upload each file, in order. All or nothing: a failure part-way
 * removes what has already gone up and reports the failure.
 */
export async function uploadAttachments(
  files: File[],
  folder: string,
): Promise<AttachmentResult<string[]>> {
  const storage = getSupabase().storage.from(CHAT_BUCKET);
  const uploaded: string[] = [];
  for (const file of files) {
    const { blob, ext } = await preparePhoto(file, MAX_ATTACHMENT_EDGE);
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await storage.upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) {
      await deleteAttachments(uploaded);
      return { ok: false, error: describeUploadFailure(error.message) };
    }
    uploaded.push(path);
  }
  return { ok: true, value: uploaded };
}

/** Storage's sentences are about buckets and mime types; a member's are not. */
function describeUploadFailure(message: string): string {
  if (/mime type|not supported/i.test(message)) {
    return 'That file is not a kind of photograph the club can hold. Try a JPEG or a PNG.';
  }
  if (/exceeded|too large|size/i.test(message)) {
    return 'That photograph is still too large after shrinking. Try a smaller one.';
  }
  if (/row-level security|policy|violates/i.test(message)) {
    return 'You cannot add a photograph here.';
  }
  return `The photograph did not upload: ${message}`;
}

/** Best effort, and silent: the caller has already said what mattered. */
export async function deleteAttachments(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await getSupabase().storage.from(CHAT_BUCKET).remove(paths);
  } catch {
    // Nothing to tell anybody. The file is still behind the read policy.
  }
}

const signed = new Map<string, { url: string; until: number }>();

/** For tests, and for a sign-out: nothing signed for one member serves the next. */
export function resetAttachmentUrls(): void {
  signed.clear();
}

async function signUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const missing = paths.filter((path) => {
    const hit = signed.get(path);
    return !hit || hit.until <= now;
  });
  if (missing.length > 0) {
    const { data } = await getSupabase()
      .storage.from(CHAT_BUCKET)
      .createSignedUrls(missing, SIGNED_FOR_SECONDS);
    for (const row of data ?? []) {
      // A path the policy refuses comes back with an error and no URL, and is
      // simply not drawn — the same as a photograph that has been deleted.
      if (row.signedUrl && row.path) {
        signed.set(row.path, { url: row.signedUrl, until: now + CACHE_FOR_MS });
      }
    }
  }
  const out = new Map<string, string>();
  for (const path of paths) {
    const hit = signed.get(path);
    if (hit && hit.until > Date.now()) out.set(path, hit.url);
  }
  return out;
}

/**
 * Signed URLs for the paths given, as they arrive. A path with no URL yet — or
 * ever, if the policy refuses it — is absent from the map.
 */
export function useAttachmentUrls(paths: readonly string[]): Map<string, string> {
  // Keyed on the paths themselves: the array is a new identity every render.
  const key = paths.join('\n');
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!key) {
      setUrls(new Map());
      return;
    }
    let live = true;
    void signUrls(key.split('\n')).then((map) => {
      if (live) setUrls(map);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return urls;
}
