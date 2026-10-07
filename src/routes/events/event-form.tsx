import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { DateFields } from '@/components/date-fields';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { readDate } from '@/lib/date-parts';
import { describeThrown } from '@/lib/describe-error';
import { saveEvent, useEvents } from '@/lib/events';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import {
  CITY_MAX,
  DESCRIPTION_MAX,
  draftFromEvent,
  type EventDraft,
  emptyDraft,
  HOST_NAME_MAX,
  hostOptions,
  LOCATION_MAX,
  mayAddEvents,
  mayChangeEvent,
  NO_ORGANIZATION,
  readDraft,
  readTime,
  TITLE_MAX,
} from '@/routes/events/event-draft';
import { EVENT_FORMAT_LABELS, EVENT_FORMATS, type EventFormat } from '@/types/domain';

/**
 * Adding an event by hand, or changing one that was (the owner, 2026-10-05).
 *
 * For an administrator, and for a member who speaks for an organization
 * (20261005010000). Nobody else is shown the way here, and `save_event`
 * refuses them if they type the address.
 *
 * Times are typed in Pacific and the form says so: a hand-added event has no
 * feed to say what zone it is in, and every organization the club has is in
 * California (lib/events.ts, HAND_ADDED_TIMEZONE). The date is three boxes
 * and the times are typed, for the reason lib/date-parts.ts gives.
 *
 * What is missing is said under the button before it is pressed, one thing
 * at a time in the order the form asks, rather than as a wall of red after.
 */
export default function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const mine = useMyOrganizations(memberId);
  const { organizations, loading: organizationsLoading } = useOrganizations();
  const { events, loading: eventsLoading } = useEvents();

  if (
    account.status === 'loading' ||
    mine.loading ||
    organizationsLoading ||
    (id && eventsLoading)
  ) {
    return (
      <p role="status" className="px-6 py-10 text-center text-[0.875rem] text-grey">
        Loading…
      </p>
    );
  }
  // Not the permission check — the database refuses either way. This is so a
  // member without the right sees Events rather than a form that cannot save.
  if (!mayAddEvents(account.isAdmin, mine.ids)) return <Navigate to="/events" replace />;

  const existing = id ? (events.find((event) => event.id === id) ?? null) : null;
  if (id && !existing) {
    return (
      <p className="px-6 py-10 text-center text-[0.875rem] text-ink2">
        This event is not on the calendar any more.
      </p>
    );
  }
  if (existing && !mayChangeEvent(existing, account.isAdmin, mine.ids)) {
    return <Navigate to={`/events/${existing.id}`} replace />;
  }

  const options = hostOptions(organizations, account.isAdmin, mine.ids);
  return (
    <EventForm
      // A different event is a different form, not this one's state carried over.
      key={existing?.id ?? 'new'}
      eventId={existing?.id ?? null}
      initial={
        existing
          ? draftFromEvent(existing)
          : emptyDraft(!account.isAdmin && options.length === 1 ? (options[0]?.id ?? null) : null)
      }
      isAdmin={account.isAdmin}
      options={options}
    />
  );
}

const FIELD =
  'mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-emphasis';
const LABEL = 'mt-4 block font-bold font-head text-[0.8125rem] text-ink';
const HINT = 'mt-1 text-[0.71875rem] text-grey leading-[1.45]';

function EventForm({
  eventId,
  initial,
  isAdmin,
  options,
}: {
  eventId: string | null;
  initial: EventDraft;
  isAdmin: boolean;
  options: { id: string; name: string }[];
}) {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isNew = eventId === null;

  // Read once per keystroke; cheap, and the button and the line under it
  // cannot disagree about what is missing.
  const reading = useMemo(() => readDraft(draft, { isNew }), [draft, isNew]);
  const dateReading = readDate(draft.date, { needs: 'day', future: true });
  const startReading = readTime(draft.startTime);
  const endReading = readTime(draft.endTime);

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    // A failure is about what was sent; once the form changes it no longer is.
    setFailure(null);
  }

  function submit() {
    if (!reading.ok || saving) return;
    setSaving(true);
    saveEvent({ id: eventId, ...reading.payload })
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        announce(isNew ? 'The event is on the calendar.' : 'Changes saved.');
        // Replacing this screen: Back from the event should not land on a
        // filled-in form that would add it a second time.
        void navigate(`/events/${result.id}`, { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'The event was not saved.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const onlyOne = !isAdmin && options.length === 1 ? options[0] : null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px] pb-6">
        <BackLink
          to={eventId ? `/events/${eventId}` : '/events'}
          label={eventId ? 'Event' : 'Events'}
        />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.01em]">
          {isNew ? 'Add an event' : 'Change this event'}
        </h1>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          Events are public: anybody can read this one, with or without an account.
          {isNew ? ' It goes on the calendar as soon as you add it.' : ''}
        </p>

        {/* ------------------------------------------------------ host */}
        {onlyOne ? (
          <p className="mt-4 text-[0.875rem] text-ink">
            For <span className="font-bold">{onlyOne.name}</span>
          </p>
        ) : (
          <>
            <label htmlFor="event-host" className={LABEL}>
              Who is hosting it?
            </label>
            <select
              id="event-host"
              value={draft.host}
              onChange={(e) => {
                set('host', e.target.value);
              }}
              className={FIELD}
            >
              <option value="">Choose…</option>
              {isAdmin ? (
                <option value={NO_ORGANIZATION}>No organization — self or community hosted</option>
              ) : null}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </>
        )}

        {draft.host === NO_ORGANIZATION ? (
          <>
            <label htmlFor="event-host-name" className={LABEL}>
              Hosted by
            </label>
            <input
              id="event-host-name"
              value={draft.hostName}
              maxLength={HOST_NAME_MAX}
              onChange={(e) => {
                set('hostName', e.target.value);
              }}
              placeholder="The SCI Club"
              className={FIELD}
            />
            <p className={HINT}>Shown under "Hosted by" on the event.</p>
          </>
        ) : null}

        {/* ------------------------------------------------------ what */}
        <label htmlFor="event-title" className={LABEL}>
          What is it called?
        </label>
        <input
          id="event-title"
          value={draft.title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            set('title', e.target.value);
          }}
          placeholder="Picnic at Lake Merritt"
          className={FIELD}
        />

        {/* ------------------------------------------------------ when */}
        <h2 id="event-date-heading" className={LABEL}>
          What day?
        </h2>
        <div className="mt-1.5">
          <DateFields
            id="event-date"
            parts={draft.date}
            onChange={(parts) => {
              set('date', parts);
            }}
            reading={dateReading}
            order={['month', 'day', 'year']}
            labelledBy="event-date-heading"
          />
        </div>

        <div className="mt-1 flex flex-wrap gap-2.5">
          <div className="min-w-[9em] flex-1">
            <label htmlFor="event-start" className={LABEL}>
              Starts
            </label>
            <input
              id="event-start"
              value={draft.startTime}
              onChange={(e) => {
                set('startTime', e.target.value);
              }}
              placeholder="6:30 pm"
              aria-describedby="event-time-hint"
              aria-invalid={startReading.kind === 'invalid' ? true : undefined}
              className={FIELD}
            />
          </div>
          <div className="min-w-[9em] flex-1">
            <label htmlFor="event-end" className={LABEL}>
              Ends (optional)
            </label>
            <input
              id="event-end"
              value={draft.endTime}
              onChange={(e) => {
                set('endTime', e.target.value);
              }}
              placeholder="8 pm"
              aria-describedby="event-time-hint"
              aria-invalid={endReading.kind === 'invalid' ? true : undefined}
              className={FIELD}
            />
          </div>
        </div>
        <p id="event-time-hint" className={HINT}>
          Pacific time, with am or pm.
        </p>

        {/* ----------------------------------------------------- where */}
        {/* A paragraph and not a label: three aria-pressed buttons rather than
            one field, as on Start a room. */}
        <p className={LABEL}>In person or online?</p>
        <SegmentPills<EventFormat | ''>
          segments={EVENT_FORMATS.map((f) => [f, EVENT_FORMAT_LABELS[f]] as const)}
          value={draft.format ?? ''}
          onChange={(next) => {
            set('format', next === '' ? null : next);
          }}
          className="flex-wrap"
        />

        <label
          htmlFor="event-location"
          className="mt-1 block font-bold font-head text-[0.8125rem] text-ink"
        >
          {draft.format === 'online' ? 'Where (optional)' : 'Where'}
        </label>
        <input
          id="event-location"
          value={draft.location}
          maxLength={LOCATION_MAX}
          onChange={(e) => {
            set('location', e.target.value);
          }}
          placeholder={draft.format === 'online' ? 'On Zoom' : 'Lakeside Park, 666 Bellevue Ave'}
          className={FIELD}
        />

        <label htmlFor="event-city" className={LABEL}>
          City (optional)
        </label>
        <input
          id="event-city"
          value={draft.city}
          maxLength={CITY_MAX}
          onChange={(e) => {
            set('city', e.target.value);
          }}
          placeholder="Oakland"
          aria-describedby="event-city-hint"
          className={FIELD}
        />
        <p id="event-city-hint" className={HINT}>
          So members can find it by place.
        </p>

        {/* ----------------------------------------------------- about */}
        <label htmlFor="event-description" className={LABEL}>
          About it (optional)
        </label>
        <textarea
          id="event-description"
          value={draft.description}
          rows={6}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => {
            set('description', e.target.value);
          }}
          placeholder="What happens, who it is for, what to bring, and whether the venue is step-free."
          className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink leading-[1.5] outline-none focus:border-emphasis"
        />
        <p className={HINT}>{DESCRIPTION_MAX - draft.description.length} characters left.</p>

        <label htmlFor="event-registration" className={LABEL}>
          Sign-up link (optional)
        </label>
        <input
          id="event-registration"
          type="url"
          inputMode="url"
          value={draft.registrationUrl}
          onChange={(e) => {
            set('registrationUrl', e.target.value);
          }}
          placeholder="https://"
          className={FIELD}
        />

        <label htmlFor="event-url" className={LABEL}>
          More details at (optional)
        </label>
        <input
          id="event-url"
          type="url"
          inputMode="url"
          value={draft.url}
          onChange={(e) => {
            set('url', e.target.value);
          }}
          placeholder="https://"
          aria-describedby="event-url-hint"
          className={FIELD}
        />
        <p id="event-url-hint" className={HINT}>
          The event shows one button: Register if there is a sign-up link, otherwise this.
        </p>

        {failure ? (
          <p
            role="alert"
            className="mt-4 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
          >
            {failure} What you wrote is still here.
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={!reading.ok || saving}
          aria-describedby={reading.ok ? undefined : 'event-missing'}
          className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {saving ? 'Saving…' : isNew ? 'Add the event' : 'Save changes'}
        </button>
        {reading.ok ? null : (
          <p id="event-missing" className="mt-2 text-center text-[0.78125rem] text-grey">
            {reading.problem}
          </p>
        )}
      </div>
    </div>
  );
}
