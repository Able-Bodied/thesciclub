import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import type { MorePhotoChange } from '@/lib/events';
import {
  deleteMyReview,
  MAX_REVIEW_PHOTOS,
  type Review,
  type ReviewTarget,
  saveReview,
  useReviews,
} from '@/lib/reviews';
import { MorePicturesField } from '@/routes/events/more-pictures-field';
import { StarPicker } from '@/routes/reviews/stars';

const LABEL = 'mt-5 block font-bold text-[0.875rem] text-ink';
const HINT = 'mt-0.5 text-[0.78125rem] text-ink2 leading-[1.45]';
const FIELD =
  'mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[1rem] text-ink outline-none focus:border-emphasis';

/**
 * Writing or changing a review, for an event at /events/:id/review and an
 * organization at /events/organizations/:id/review. Where the follow-up the
 * morning after an event opens (20261031070000).
 */
export default function ReviewPage({ kind }: { kind: ReviewTarget['kind'] }) {
  const { id = '' } = useParams<{ id: string }>();
  const target: ReviewTarget = { kind, id };
  const { reviews, options, loading } = useReviews(target);
  const back = kind === 'event' ? `/events/${id}` : `/events/organizations/${id}`;
  // On an event's page the list holds other dates' too; only this one's is it.
  const mine = reviews.find(
    (review) => review.mine && (kind === 'organization' ? !review.eventId : review.eventId === id),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pt-6 pb-10">
        {loading ? (
          <p role="status" className="py-8 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : options?.canReview ? (
          <Form
            key={mine?.id ?? 'new'}
            target={target}
            title={options.title}
            organizationName={options.organizationName}
            anonymousAllowed={options.anonymousAllowed}
            mine={mine}
            back={back}
          />
        ) : (
          <p className="py-8 text-center text-[0.875rem] text-ink2 leading-[1.5]">
            {kind === 'event'
              ? 'Reviews of an event come from people who checked in to it.'
              : 'Reviews of an organization come from its members.'}
          </p>
        )}
      </div>
    </div>
  );
}

function Form({
  target,
  title,
  organizationName,
  anonymousAllowed,
  mine,
  back,
}: {
  target: ReviewTarget;
  title: string;
  organizationName: string | null;
  anonymousAllowed: boolean;
  mine: Review | undefined;
  back: string;
}) {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [body, setBody] = useState(mine?.body ?? '');
  const [anonymous, setAnonymous] = useState(mine?.anonymous === true);
  const [onlyOrganization, setOnlyOrganization] = useState(mine?.onlyOrganization === true);
  const [photos, setPhotos] = useState<MorePhotoChange[]>(
    (mine?.photos ?? []).map((photo) => ({ kind: 'keep', ...photo })),
  );
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!anonymousAllowed) setAnonymous(false);
  }, [anonymousAllowed]);

  function finish(said: string) {
    announce(said);
    void navigate(back, { replace: true });
  }

  function save() {
    setSaving(true);
    setFailure(null);
    void saveReview(target, { rating, body, anonymous, onlyOrganization, photos }).then((done) => {
      setSaving(false);
      if (done.ok) finish('Your review is saved.');
      else setFailure(done.error);
    });
  }

  function remove() {
    if (!mine) return;
    setSaving(true);
    setFailure(null);
    void deleteMyReview(mine.id).then((done) => {
      setSaving(false);
      if (done.ok) finish('Your review is deleted.');
      else setFailure(done.error);
    });
  }

  return (
    <>
      <p className="font-bold text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {mine ? 'Your review' : 'Leave a review'}
      </p>
      <h1 className="mt-1 mb-4 font-extrabold font-display text-[1.5rem] text-ink leading-tight">
        {title}
      </h1>

      <StarPicker value={rating} onChange={setRating} />

      <label className={LABEL}>
        What was it like? (optional)
        <textarea
          rows={5}
          maxLength={2000}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
          placeholder="What would you tell somebody deciding whether to go? Think about access, parking and who was there."
          className={`${FIELD} font-normal`}
        />
      </label>

      <MorePicturesField
        value={photos}
        onChange={setPhotos}
        max={MAX_REVIEW_PHOTOS}
        label="Pictures (optional)"
        hint={`Up to ${MAX_REVIEW_PHOTOS}. Please ask before sharing a picture of somebody.`}
        addLabel="Add pictures"
        labelClassName={LABEL}
        hintClassName={HINT}
        fieldClassName={FIELD}
      />

      {anonymousAllowed ? (
        <label className="mt-5 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => {
              setAnonymous(e.target.checked);
            }}
            className="mt-1 h-5 w-5 flex-none accent-[var(--color-action)]"
          />
          <span>
            <span className="block font-bold text-[0.875rem] text-ink">Post anonymously</span>
            <span className={`block ${HINT}`}>
              Other members and the organization won't see your name. The club's administrators can,
              if somebody reports it. Your words or pictures could still give you away at a small
              event.
            </span>
          </span>
        </label>
      ) : (
        <p className={`mt-5 ${HINT}`}>
          {organizationName ?? 'This organization'} does not take anonymous reviews, so your name
          shows with this one.
        </p>
      )}

      {organizationName ? (
        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={onlyOrganization}
            onChange={(e) => {
              setOnlyOrganization(e.target.checked);
            }}
            className="mt-1 h-5 w-5 flex-none accent-[var(--color-action)]"
          />
          <span>
            <span className="block font-bold text-[0.875rem] text-ink">
              Only for {organizationName}
            </span>
            <span className={`block ${HINT}`}>
              Other members won't see it. Only {organizationName}'s org admins and the club's
              administrators will.
            </span>
          </span>
        </label>
      ) : null}

      <button
        type="button"
        disabled={rating === 0 || saving}
        onClick={save}
        className="mt-6 flex min-h-12 w-full items-center justify-center rounded-[13px] bg-action font-bold font-head text-[0.9375rem] text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : mine ? 'Save your review' : 'Post your review'}
      </button>
      {rating === 0 ? (
        <p className={`mt-1.5 text-center ${HINT}`}>Choose a rating to post.</p>
      ) : null}
      {mine ? (
        <button
          type="button"
          disabled={saving}
          onClick={remove}
          className="mt-3 min-h-[44px] w-full font-semibold text-[0.875rem] text-destructive"
        >
          Delete your review
        </button>
      ) : null}
      {failure ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {failure}
        </p>
      ) : null}
    </>
  );
}
