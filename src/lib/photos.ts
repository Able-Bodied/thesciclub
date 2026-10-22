import {
  type SignedBucket,
  thumbPath,
  useAttachmentUrls,
  useSmallCopies,
} from '@/lib/chat/attachments';
import { prepareThumb } from '@/lib/image';
import { getSupabase } from '@/lib/supabase';

/**
 * Member photos live in the `photos` bucket, and `members.photo_path` stores
 * the path inside it — `seed/<id>.webp` — rather than a full URL. So do the
 * organizations' logos, as `organizations.logo_path`.
 *
 * The reason is portability: a storage URL embeds the project ref, so data
 * carrying full URLs would point a staging database at production's storage.
 * The path is the same in every project; only the origin differs.
 *
 * ---------------------------------------------------------------------------
 * Signed, not public — HANDOFF.md "What Home is" step 6, part 2
 * ---------------------------------------------------------------------------
 * Until 2026-09-30 this built a public URL by hand, and anybody holding one
 * could open the photograph without signing in, for ever. CONTEXT.md puts
 * photos behind sign-in, and the owner chose to make the bucket match. Every
 * face and logo is now drawn through a signed URL, the way chat photographs
 * always were, asked for under the reader's own token and cached for a little
 * under its hour (src/lib/chat/attachments.ts). Paths asked for together are
 * signed in one request, so a screen of faces is one round trip, not one per
 * face.
 *
 * Until a URL arrives the caller draws what it draws for a member with no
 * photograph — the initials, or the short-code badge — so there is no broken
 * image on the way in. A path storage refuses never arrives, and looks the
 * same.
 *
 * The client went out first (fd5d69e), while the bucket was still public: a
 * signed URL to a public file is still a URL, but a public URL to a private
 * file is every photograph broken at once. 20261001000000 closed the bucket
 * after the owner had seen every face drawing on production. Who may be
 * signed which file is that migration's select policy: a member, anything;
 * any signed-in account, the logos and its own folder; somebody mid-signup,
 * the face on their claim card.
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
