import {
  type SignedBucket,
  thumbPath,
  useAttachmentUrls,
  useSmallCopies,
} from '@/lib/chat/attachments';
import { prepareThumb } from '@/lib/image';
import { getSupabase } from '@/lib/supabase';

/**
 * Member photos and organization logos live in the `photos` bucket; `members.photo_path` and
 * `organizations.logo_path` store the path (`seed/<id>.webp`), not a URL, since a URL embeds the
 * project ref and would point staging at production's storage.
 *
 * Signed, not public (HANDOFF.md "What Home is" step 6, part 2): photos are behind sign-in
 * (CONTEXT.md, the owner). Signed under the reader's token, batched, cached just under the hour
 * (src/lib/chat/attachments.ts). Until a URL arrives, or if refused, callers draw the initials.
 * 20261001000000 closed the bucket, after the client (fd5d69e); its select policy says who may be
 * signed which file.
 */
export const PHOTOS_BUCKET: SignedBucket = 'photos';

export { thumbPath };

/**
 * Upload a fitted photograph and, beside it, its small copy (2026-10-22).
 * The copy is best effort: without one, a list draws the photograph itself.
 */
export async function uploadPhoto(path: string, photo: Blob) {
  const storage = getSupabase().storage.from(PHOTOS_BUCKET);
  const thumb = await prepareThumb(photo);
  const [upload] = await Promise.all([
    storage.upload(path, photo, { upsert: true, contentType: photo.type }),
    thumb
      ? storage
          .upload(thumbPath(path), thumb, { upsert: true, contentType: thumb.type })
          .catch(() => null)
      : null,
  ]);
  return upload;
}

/**
 * `thumb` where a face is drawn small: the small copy, or the photograph
 * itself once storage says there is no copy (one uploaded before copies were
 * made). Both are signed in the one request.
 */
export type PhotoSize = 'full' | 'thumb';

/** Signed URLs for the photographs and logos given, keyed by path. */
export function usePhotoUrls(
  paths: readonly (string | null | undefined)[],
  size: PhotoSize = 'full',
): Map<string, string> {
  const given = paths.filter((path): path is string => Boolean(path));
  const copies = useSmallCopies(size === 'thumb' ? given : [], PHOTOS_BUCKET);
  const urls = useAttachmentUrls(size === 'thumb' ? [] : given, PHOTOS_BUCKET);
  return size === 'thumb' ? copies.small : urls;
}

/**
 * One photograph's signed URL, or null — none stored, not signed yet, or
 * refused — in which case the caller shows the initials tile rather than a
 * broken image.
 */
export function usePhotoUrl(
  path: string | null | undefined,
  size: PhotoSize = 'full',
): string | null {
  const urls = usePhotoUrls([path], size);
  return path ? (urls.get(path) ?? null) : null;
}
