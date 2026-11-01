import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import {
  averageRating,
  type Review,
  type ReviewTarget,
  replyToReview,
  reportReview,
  useReviews,
} from '@/lib/reviews';
import { EventGallery } from '@/routes/events/event-gallery';
import { Stars } from '@/routes/reviews/stars';

const HEADING =
  'mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]';
const LINK = 'min-h-[36px] font-bold text-[0.8125rem] text-emphasis underline underline-offset-2';

/**
 * Reviews on an event's or an organization's page (the owner, 2026-10-31).
 * An event's include the other dates of its series, and an organization's
 * include its events, so each says what it was about when that is not this page.
 */
export function ReviewsSection({ target }: { target: ReviewTarget }) {
  const { reviews, options, loading, reload } = useReviews(target);
  if (loading) return null;

  const { average, count } = averageRating(reviews);
  const mine = reviews.find((review) => review.mine);
  const write =
    target.kind === 'event'
      ? `/events/${target.id}/review`
      : `/events/organizations/${target.id}/review`;
  // Nothing to read and nothing to do: no heading over an empty space.
  if (reviews.length === 0 && !options?.canReview) return null;

  return (
    <section aria-label="Reviews">
      <h2 className={HEADING}>Reviews</h2>
      {count > 0 ? (
        <p className="mb-2.5 flex items-center gap-2 text-[0.875rem] text-ink">
          <Stars value={average} />
          <span>
            <b>{average}</b> · {count} {count === 1 ? 'review' : 'reviews'}
          </span>
        </p>
      ) : null}

      {options?.canReview || mine ? (
        <Link
          to={write}
          className="mb-3 flex min-h-[46px] items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
        >
          {mine ? 'Change your review' : 'Leave a review'}
        </Link>
      ) : null}

      {reviews.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {reviews.map((review) => (
            <Item key={review.id} review={review} target={target} onChanged={reload} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Item({
  review,
  target,
  onChanged,
}: {
  review: Review;
  target: ReviewTarget;
  onChanged: () => void;
}) {
  const name = review.anonymous ? 'Anonymous member' : (review.authorName ?? 'Deleted member');
  const elsewhere =
    review.eventId && !(target.kind === 'event' && target.id === review.eventId)
      ? review.eventTitle
      : null;
  const [first, ...rest] = review.photos;

  return (
    <li className="rounded-[14px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-2.5">
        {review.authorId ? (
          <MemberAvatar
            id={review.authorId}
            displayName={name}
            photoPath={review.authorPhoto}
            photoAlt={null}
          />
        ) : null}
        <div className="min-w-0">
          {review.authorHasProfile && review.authorId ? (
            <Link
              to={`/peers/${review.authorId}`}
              className="font-bold text-[0.9375rem] text-ink underline-offset-2 hover:underline"
            >
              {name}
            </Link>
          ) : (
            <p className="font-bold text-[0.9375rem] text-ink">{name}</p>
          )}
          <p className="text-[0.78125rem] text-grey">
            {new Date(review.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            {elsewhere ? ` · ${elsewhere}` : ''}
          </p>
        </div>
      </div>

      <Stars value={review.rating} className="mt-2" />
      {review.onlyOrganization ? (
        <p className="mt-1 font-semibold text-[0.78125rem] text-ink2">
          Only {review.organizationName ?? 'the organization'} and the club's administrators see
          this.
        </p>
      ) : null}
      {review.body ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[0.875rem] text-ink leading-[1.5]">
          {review.body}
        </p>
      ) : null}
      {first ? (
        <EventGallery path={first.path} alt={first.alt} more={rest} className="mt-2.5" />
      ) : null}

      {review.orgReply ? (
        <div className="mt-2.5 rounded-r-[11px] border-emphasis border-l-[3px] bg-tint px-3 py-2">
          <p className="font-bold text-[0.78125rem] text-ink">
            Reply from {review.organizationName ?? 'the organization'}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[0.8125rem] text-ink2 leading-[1.45]">
            {review.orgReply}
          </p>
        </div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap gap-x-4">
        {review.canReply ? <ReplyControl review={review} onChanged={onChanged} /> : null}
        {review.mine ? null : <ReportControl reviewId={review.id} />}
      </div>
    </li>
  );
}

function ReplyControl({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState(review.orgReply ?? '');
  const [failure, setFailure] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className={LINK}
        data-target="small"
      >
        {review.orgReply ? 'Change reply' : 'Reply'}
      </button>
    );
  }
  return (
    <div className="mt-1.5 w-full">
      <label className="block font-bold text-[0.8125rem] text-ink">
        Reply from {review.organizationName ?? 'the organization'}
        <textarea
          rows={3}
          maxLength={1000}
          value={words}
          onChange={(e) => {
            setWords(e.target.value);
          }}
          className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 font-normal text-[0.9375rem] text-ink outline-none focus:border-emphasis"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void replyToReview(review.id, words).then((done) => {
            if (done.ok) {
              setOpen(false);
              onChanged();
            } else {
              setFailure(done.error);
            }
          });
        }}
        className="mt-2 min-h-[44px] rounded-[11px] bg-action px-4 font-bold text-[0.875rem] text-white"
      >
        Save reply
      </button>
      {failure ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

function ReportControl({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (sent) {
    return (
      <p role="status" className="py-2 text-[0.8125rem] text-ink2">
        Reported to the club's administrators.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="min-h-[36px] text-[0.8125rem] text-ink2 underline underline-offset-2"
        data-target="small"
      >
        Report
      </button>
    );
  }
  return (
    <div className="mt-1.5 w-full">
      <label className="block font-bold text-[0.8125rem] text-ink">
        What is wrong with this review? (optional)
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 font-normal text-[0.9375rem] text-ink outline-none focus:border-emphasis"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void reportReview(reviewId, note).then((done) => {
            if (done.ok) setSent(true);
            else setFailure(done.error);
          });
        }}
        className="mt-2 min-h-[44px] rounded-[11px] bg-destructive px-4 font-bold text-[0.875rem] text-white"
      >
        Send report
      </button>
      {failure ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
