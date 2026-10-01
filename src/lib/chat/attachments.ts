import { useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
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
 *                        the point. JPEG on an iPhone, where the browser
 *                        cannot write webp; see image.ts. Until 2026-09-29 it
 *                        fell back to the original there, which is usually
 *                        over the bucket's 2MB, so no photograph could be put
 *                        on a topic from a phone
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

export const CHAT_BUCKET: SignedBucket = 'chat';
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
 * The bucket's own sentences — about mime types and sizes — are translated by
 * describeError; the one this screen owns is the policy's, which here means
 * the member is not in the thread or the room.
 */
const UPLOAD_REFUSAL = {
  attempt: 'The photograph did not upload.',
  refused: 'You cannot add a photograph here.',
};

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
      return { ok: false, error: describeError(error, UPLOAD_REFUSAL) };
    }
    uploaded.push(path);
  }
  return { ok: true, value: uploaded };
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

/**
 * The buckets read through signed URLs. `chat` from the start; `photos` —
 * every member photograph, the seeded directory's and the organizations'
 * logos — from HOME-PLAN.md step 6, part 2, through `usePhotoUrls` in
 * src/lib/photos.ts. One cache for both, so there is one thing to keep right.
 */
export type SignedBucket = 'chat' | 'photos';

/** Keyed by bucket and path: the same path in two buckets is two files. */
const signed = new Map<string, { url: string; until: number }>();
const cacheKey = (bucket: SignedBucket, path: string) => `${bucket}\n${path}`;

/**
 * The photos bucket's URLs outlive a reload; chat's do not.
 *
 * Measured on the local stack with 150ms of latency (HANDOFF.md, "Home, step
 * 6"): with the cache in memory only, reloading Peers drew its faces in about
 * 1,060ms against 580ms from public URLs. A reload forgot every URL, so each
 * face was signed again, and a new token is a new URL to the browser, so each
 * photograph was downloaded again rather than read from its cache. Reopening
 * the app is a reload. Kept here until they expire, the same URLs come back,
 * nothing is signed and the browser's cache answers.
 *
 * Only `photos`: a face is readable by every member already. A chat URL opens
 * a photograph from a private conversation, and stays in memory, where a
 * reload ends it. Both are forgotten on sign-out (signOut in account.tsx).
 */
const KEPT_BUCKET: SignedBucket = 'photos';
const KEPT_KEY = 'thesciclub.signed-photos';

function restoreKept(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEPT_KEY);
  } catch {
    // Private mode, or storage blocked: faces are signed again, as before.
  }
  if (!stored) return;
  try {
    const now = Date.now();
    const kept = JSON.parse(stored) as Record<string, { url?: unknown; until?: unknown }>;
    for (const [path, hit] of Object.entries(kept)) {
      if (typeof hit.url === 'string' && typeof hit.until === 'number' && hit.until > now) {
        signed.set(cacheKey(KEPT_BUCKET, path), { url: hit.url, until: hit.until });
      }
    }
  } catch {
    // Not ours, or damaged. Nothing restored; the next signing writes it again.
  }
}

function saveKept(): void {
  const now = Date.now();
  const prefix = cacheKey(KEPT_BUCKET, '');
  const kept: Record<string, { url: string; until: number }> = {};
  for (const [key, hit] of signed) {
    if (key.startsWith(prefix) && hit.until > now) kept[key.slice(prefix.length)] = hit;
  }
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(kept));
  } catch {
    // Storage full or blocked. The URLs still serve this page.
  }
}

restoreKept();

/** For tests, and for a sign-out: nothing signed for one member serves the next. */
export function resetAttachmentUrls(): void {
  signed.clear();
  queued.clear();
  inFlight.clear();
  try {
    localStorage.removeItem(KEPT_KEY);
  } catch {
    // Nothing was kept where storage is blocked.
  }
}

/** What the cache already holds for these paths, unexpired. */
function cachedUrls(bucket: SignedBucket, paths: readonly string[]): Map<string, string> {
  const now = Date.now();
  const out = new Map<string, string>();
  for (const path of paths) {
    const hit = signed.get(cacheKey(bucket, path));
    if (hit && hit.until > now) out.set(path, hit.url);
  }
  return out;
}

/**
 * Paths asked for in the same moment, signed in one request.
 *
 * The Peers deck draws twenty-odd faces and Home a dozen, each through its
 * own component, and each component asks for its own path. Signing as they
 * asked would be a request per face. Instead every path asked for before the
 * next turn of the event loop joins one batch per bucket, and the batch is
 * one `createSignedUrls` — the whole screen in one round trip.
 */
const queued = new Map<SignedBucket, { paths: Set<string>; done: Promise<void> }>();
/** A path already being signed is waited on, not asked for twice. */
const inFlight = new Map<string, Promise<void>>();

function enqueue(bucket: SignedBucket, paths: readonly string[]): Promise<void> {
  let batch = queued.get(bucket);
  if (!batch) {
    const fresh = { paths: new Set<string>(), done: Promise.resolve() };
    fresh.done = new Promise<void>((resolve) => {
      setTimeout(() => {
        queued.delete(bucket);
        void sign(bucket, [...fresh.paths]).finally(resolve);
      }, 0);
    });
    queued.set(bucket, fresh);
    batch = fresh;
  }
  for (const path of paths) {
    batch.paths.add(path);
    inFlight.set(cacheKey(bucket, path), batch.done);
  }
  return batch.done;
}

async function sign(bucket: SignedBucket, paths: string[]): Promise<void> {
  const now = Date.now();
  try {
    const { data } = await getSupabase()
      .storage.from(bucket)
      .createSignedUrls(paths, SIGNED_FOR_SECONDS);
    for (const row of data ?? []) {
      // A path the policy refuses comes back with an error and no URL, and is
      // simply not drawn — the same as a photograph that has been deleted.
      if (row.signedUrl && row.path) {
        signed.set(cacheKey(bucket, row.path), { url: row.signedUrl, until: now + CACHE_FOR_MS });
      }
    }
  } catch {
    // Offline, or the request failed: nothing is drawn but the initials or
    // the tile, which is what a face without a photograph looks like anyway.
    // The next screen to ask tries again.
  } finally {
    for (const path of paths) inFlight.delete(cacheKey(bucket, path));
  }
  if (bucket === KEPT_BUCKET) saveKept();
}

async function signUrls(bucket: SignedBucket, paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const waits = new Set<Promise<void>>();
  const missing: string[] = [];
  for (const path of paths) {
    const hit = signed.get(cacheKey(bucket, path));
    if (hit && hit.until > now) continue;
    const pending = inFlight.get(cacheKey(bucket, path));
    if (pending) waits.add(pending);
    else missing.push(path);
  }
  if (missing.length > 0) waits.add(enqueue(bucket, missing));
  await Promise.all(waits);
  return cachedUrls(bucket, paths);
}

const NONE = new Map<string, string>();

/**
 * Signed URLs for the paths given, as they arrive. A path with no URL yet — or
 * ever, if the policy refuses it — is absent from the map.
 *
 * What the cache already holds is there on the first render, so a face seen
 * a moment ago does not blink to its initials and back on the way to a
 * screen it was signed for.
 */
export function useAttachmentUrls(
  paths: readonly string[],
  bucket: SignedBucket = CHAT_BUCKET,
): Map<string, string> {
  // Keyed on the paths themselves: the array is a new identity every render.
  const key = paths.join('\n');
  const [arrived, setArrived] = useState<{ key: string; urls: Map<string, string> }>(() => ({
    key,
    urls: key ? cachedUrls(bucket, key.split('\n')) : NONE,
  }));

  useEffect(() => {
    if (!key) return;
    let live = true;
    void signUrls(bucket, key.split('\n')).then((urls) => {
      if (live) setArrived({ key, urls });
    });
    return () => {
      live = false;
    };
  }, [key, bucket]);

  if (!key) return NONE;
  return arrived.key === key ? arrived.urls : cachedUrls(bucket, key.split('\n'));
}
