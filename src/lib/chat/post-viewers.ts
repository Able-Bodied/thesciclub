import type { ViewDevice } from '@/lib/device';
import { getSupabase } from '@/lib/supabase';

/** One member who viewed a post, as an administrator sees it. */
export interface PostViewer {
  memberId: string;
  displayName: string;
  photoPath: string | null;
  photoAlt: string | null;
  /** The earliest time known; null for a view kept without one. */
  seenAt: string | null;
  /** Empty for views from before devices were recorded (2026-10-20). */
  devices: ViewDevice[];
}

interface Row {
  member_id: string;
  display_name: string;
  photo_path: string | null;
  photo_alt: string | null;
  seen_at: string | null;
  devices: ViewDevice[] | null;
}

/** Administrators only: the database refuses anybody else (20261022030000). */
export async function fetchPostViewers(postId: string): Promise<PostViewer[]> {
  const { data, error } = (await getSupabase().rpc('admin_post_viewers', { post: postId })) as {
    data: Row[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    memberId: row.member_id,
    displayName: row.display_name,
    photoPath: row.photo_path,
    photoAlt: row.photo_alt,
    seenAt: row.seen_at,
    devices: row.devices ?? [],
  }));
}
