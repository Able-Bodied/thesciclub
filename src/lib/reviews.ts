import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import type { EventPhoto, MorePhotoChange } from '@/lib/events';
import { preparePhoto } from '@/lib/image';
import { PHOTOS_BUCKET } from '@/lib/photos';
import { getSupabase } from '@/lib/supabase';

/**
 * Reviews of events and organizations (the owner, 2026-10-31; 20261031080000).
 * Stars, words and pictures, from whoever checked in or belongs. All through
 * functions: an anonymous review hides its author from everybody but the
 * club's administrators, who see it on a report.
 */

export interface ReviewTarget {
  kind: 'event' | 'organization';
  id: string;
}

export const MAX_REVIEW_PHOTOS = 4;
const PHOTO_EDGE = 1600;

export interface Review {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  organizationName: string | null;
  rating: number;
  body: string;
  photos: EventPhoto[];
  anonymous: boolean;
  onlyOrganization: boolean;
  authorId: string | null;
  authorName: string | null;
  authorHasProfile: boolean;
  authorPhoto: string | null;
  orgReply: string | null;
  createdAt: string;
  mine: boolean;
  canReply: boolean;
}

export interface ReviewOptions {
  canReview: boolean;
  title: string;
  organizationName: string | null;
  anonymousAllowed: boolean;
}

interface ReviewRow {
  id: string;
  event_id: string | null;
  event_title: string | null;
  organization_name: string | null;
  rating: number;
  body: string;
  photos: EventPhoto[] | null;
  anonymous: boolean;
  only_organization: boolean;
  author_id: string | null;
  author_name: string | null;
  author_has_profile: boolean;
  author_photo: string | null;
  org_reply: string | null;
  created_at: string;
  mine: boolean;
  can_reply: boolean;
}

interface OptionsRow {
  can_review: boolean;
  title: string | null;
  organization_name: string | null;
  anonymous_allowed: boolean;
}

type Done = { ok: true } | { ok: false; error: string };

const asArgs = (target: ReviewTarget) => ({
  p_event: target.kind === 'event' ? target.id : null,
  p_organization: target.kind === 'organization' ? target.id : null,
});

async function write(name: string, args: Record<string, unknown>, refusal: string): Promise<Done> {
  try {
    const { error } = (await getSupabase().rpc(name, args)) as { error: Failure | null };
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

/** The reviews, and whether this member may write one. `reload` reads them again. */
export function useReviews(target: ReviewTarget) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [options, setOptions] = useState<ReviewOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [reads, setReads] = useState(0);
  const { kind, id } = target;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reads is there to read them again.
  useEffect(() => {
    let live = true;
    const args = asArgs({ kind, id });
    void Promise.all([
      Promise.resolve(getSupabase().rpc('reviews_for', args)),
      Promise.resolve(getSupabase().rpc('review_options', args)),
    ]).then(
      ([list, offered]) => {
        if (!live) return;
        setReviews(((list.data ?? []) as ReviewRow[]).map(toReview));
        const row = (offered.data as OptionsRow[] | null)?.[0];
        setOptions(
          row
            ? {
                canReview: row.can_review,
                title: row.title ?? '',
                organizationName: row.organization_name,
                anonymousAllowed: row.anonymous_allowed,
              }
            : null,
        );
        setLoading(false);
      },
      () => {
        if (live) setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [kind, id, reads]);

  const reload = useCallback(() => {
    setReads((n) => n + 1);
  }, []);
  return { reviews, options, loading, reload };
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    organizationName: row.organization_name,
    rating: row.rating,
    body: row.body,
    photos: row.photos ?? [],
    anonymous: row.anonymous,
    onlyOrganization: row.only_organization,
    authorId: row.author_id,
    authorName: row.author_name,
    authorHasProfile: row.author_has_profile,
    authorPhoto: row.author_photo,
    orgReply: row.org_reply,
    createdAt: row.created_at,
    mine: row.mine,
    canReply: row.can_reply,
  };
}

/** The average of the reviews everybody can read, to one place. */
export function averageRating(reviews: readonly Review[]): { average: number; count: number } {
  const open = reviews.filter((review) => !review.onlyOrganization);
  const total = open.reduce((sum, review) => sum + review.rating, 0);
  return {
    average: open.length === 0 ? 0 : Math.round((total / open.length) * 10) / 10,
    count: open.length,
  };
}

export async function saveReview(
  target: ReviewTarget,
  draft: {
    rating: number;
    body: string;
    anonymous: boolean;
    onlyOrganization: boolean;
    photos: readonly MorePhotoChange[];
  },
): Promise<Done> {
  const refusal = 'Your review was not saved. Try again.';
  try {
    const folder = crypto.randomUUID();
    const photos: EventPhoto[] = [];
    const storage = getSupabase().storage.from(PHOTOS_BUCKET);
    for (const photo of draft.photos) {
      if (photo.kind === 'keep') {
        photos.push({ path: photo.path, alt: photo.alt });
        continue;
      }
      const { blob, ext } = await preparePhoto(photo.file, PHOTO_EDGE, '#ffffff');
      const path = `reviews/${folder}/${crypto.randomUUID()}.${ext}`;
      const upload = await storage.upload(path, blob, { upsert: false, contentType: blob.type });
      if (upload.error) return { ok: false, error: describeError(upload.error, refusal) };
      photos.push({ path, alt: photo.alt });
    }
    return await write(
      'save_review',
      {
        ...asArgs(target),
        p_rating: draft.rating,
        p_body: draft.body,
        p_anonymous: draft.anonymous,
        p_only_organization: draft.onlyOrganization,
        p_photos: photos,
      },
      refusal,
    );
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

export function deleteMyReview(reviewId: string) {
  return write('delete_my_review', { p_review: reviewId }, 'Your review was not deleted.');
}

export function replyToReview(reviewId: string, reply: string) {
  return write(
    'reply_to_review',
    { p_review: reviewId, p_reply: reply },
    'Your reply was not saved.',
  );
}

export function reportReview(reviewId: string, note: string) {
  return write(
    'report_review',
    { p_review: reviewId, p_note: note },
    'Your report was not sent. Try again.',
  );
}

export function setAnonymousReviews(organizationId: string, allowed: boolean) {
  return write(
    'set_organization_anonymous_reviews',
    { p_organization: organizationId, p_allowed: allowed },
    'That was not saved. Try again.',
  );
}

export interface ReportedReview {
  reviewId: string;
  place: string;
  rating: number;
  body: string;
  photos: EventPhoto[];
  anonymous: boolean;
  authorName: string | null;
  notes: string[];
  reports: number;
}

/** For the Reports tab. */
export function useReportedReviews() {
  const [reported, setReported] = useState<ReportedReview[]>([]);
  const [reads, setReads] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reads is there to read them again.
  useEffect(() => {
    let live = true;
    void Promise.resolve(getSupabase().rpc('admin_reported_reviews')).then(
      ({ data }) => {
        if (!live) return;
        const rows = (data ?? []) as {
          review_id: string;
          place: string;
          rating: number;
          body: string;
          photos: EventPhoto[] | null;
          anonymous: boolean;
          author_name: string | null;
          notes: string[] | null;
          reports: number;
        }[];
        setReported(
          rows.map((row) => ({
            reviewId: row.review_id,
            place: row.place,
            rating: row.rating,
            body: row.body,
            photos: row.photos ?? [],
            anonymous: row.anonymous,
            authorName: row.author_name,
            notes: row.notes ?? [],
            reports: row.reports,
          })),
        );
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [reads]);

  const settle = useCallback(async (reviewId: string, remove: boolean) => {
    const done = await write(
      'admin_settle_review_report',
      { p_review: reviewId, p_remove: remove },
      'That was not saved. Try again.',
    );
    if (done.ok) setReads((n) => n + 1);
    return done;
  }, []);

  return { reported, settle };
}
