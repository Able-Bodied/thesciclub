import { useState } from 'react';
import { useReportedReviews } from '@/lib/reviews';
import { Stars } from '@/routes/reviews/stars';

/**
 * Reviews somebody reported, for the Reports tab (the owner, 2026-10-31), with
 * who wrote them, an anonymous one included.
 */
export function ReportedReviews() {
  const { reported, settle } = useReportedReviews();
  const [failure, setFailure] = useState<string | null>(null);
  if (reported.length === 0) return null;

  function decide(reviewId: string, remove: boolean) {
    setFailure(null);
    void settle(reviewId, remove).then((done) => {
      if (!done.ok) setFailure(done.error);
    });
  }

  return (
    <section aria-label="Reported reviews" className="mb-5">
      <h2 className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        Reported reviews ({reported.length})
      </h2>
      <ul className="flex flex-col gap-2.5">
        {reported.map((review) => (
          <li key={review.reviewId} className="rounded-[14px] border border-line bg-paper p-3.5">
            <p className="font-bold text-[0.9375rem] text-ink">{review.place}</p>
            <p className="text-[0.78125rem] text-grey">
              {review.authorName}
              {review.anonymous ? ' (posted anonymously)' : ''} · {review.reports}{' '}
              {review.reports === 1 ? 'report' : 'reports'}
              {review.photos.length > 0 ? ` · ${review.photos.length} pictures` : ''}
            </p>
            <Stars value={review.rating} className="mt-1.5" />
            {review.body ? (
              <p className="mt-1 whitespace-pre-wrap text-[0.875rem] text-ink">{review.body}</p>
            ) : null}
            {review.notes.map((note) => (
              <p key={note} className="mt-1.5 text-[0.8125rem] text-ink2">
                Reported: {note}
              </p>
            ))}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  decide(review.reviewId, false);
                }}
                className="min-h-[44px] rounded-[11px] border-[1.6px] border-line font-bold text-[0.875rem] text-ink2"
              >
                Leave it up
              </button>
              <button
                type="button"
                onClick={() => {
                  decide(review.reviewId, true);
                }}
                className="min-h-[44px] rounded-[11px] bg-destructive font-bold text-[0.875rem] text-white"
              >
                Remove it
              </button>
            </div>
          </li>
        ))}
      </ul>
      {failure ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
