/**
 * Member photos live in the public `photos` bucket, and `members.photo_path`
 * stores the path inside it — `seed/<id>.webp` — rather than a full URL.
 *
 * The reason is portability: a public storage URL embeds the project ref, so
 * data carrying full URLs would point a staging database at production's
 * storage. The path is the same in every project; only the origin differs, and
 * that comes from the environment the client is already configured with.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export const PHOTOS_BUCKET = 'photos';

/**
 * A public URL for a stored photo, or null when there is no photo — in which
 * case the caller shows the initials tile rather than a broken image.
 */
export function photoUrlFor(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTOS_BUCKET}/${path}`;
}
