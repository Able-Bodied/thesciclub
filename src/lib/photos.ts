import { type SignedBucket, useAttachmentUrls } from '@/lib/chat/attachments';

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
 * Signed, not public — HOME-PLAN.md step 6, part 2
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
 * The client goes out first, while the bucket is still public: a signed URL
 * to a public file is still a URL, but a public URL to a private file is
 * every photograph broken at once. The migration that closes the bucket
 * comes after, once every face has been seen drawing on production.
 */
export const PHOTOS_BUCKET: SignedBucket = 'photos';

/** Signed URLs for the photographs and logos given, keyed by path. */
export function usePhotoUrls(paths: readonly (string | null | undefined)[]): Map<string, string> {
  return useAttachmentUrls(
    paths.filter((path): path is string => Boolean(path)),
    PHOTOS_BUCKET,
  );
}

/**
 * One photograph's signed URL, or null — none stored, not signed yet, or
 * refused — in which case the caller shows the initials tile rather than a
 * broken image.
 */
export function usePhotoUrl(path: string | null | undefined): string | null {
  const urls = usePhotoUrls([path]);
  return path ? (urls.get(path) ?? null) : null;
}
