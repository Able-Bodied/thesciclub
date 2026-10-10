import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { partsFromIso, readDate } from '@/lib/date-parts';
import { describeThrown } from '@/lib/describe-error';
import { saveEvent, saveEventSeries, useEvents } from '@/lib/events';
import { useMyOrganizations } from '@/lib/organization-representatives';
import { useOrganizations } from '@/lib/organizations';
import { DescriptionEditor } from '@/routes/events/description-editor';
import {
  CITY_MAX,
  DESCRIPTION_MAX,
  describeRepeat,
  draftFromEvent,
  type EventDraft,
  emptyDraft,
  HOST_NAME_MAX,
  hostOptions,
  LOCATION_MAX,
  mayAddEvents,
  mayChangeEvent,
  NO_ORGANIZATION,
  type RepeatChoice,
  type RepeatEnd,
  readDraft,
  readRepeat,
  readTime,
  repeatLabels,
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
 * California (lib/events.ts, HAND_ADDED_TIMEZONE). The owner chose the
 * phone/browser calendar for the date (2026-10-06); times remain typed.
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
  const { events, loading: eventsLoading } = useEvents({
    id: id ?? '00000000-0000-0000-0000-000000000000',
  });

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

/** A field's look without its width or spacing, for the boxes that sit in a row. */
const BOX =
  'min-h-[44px] rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-emphasis';
const FIELD = `mt-1.5 w-full ${BOX}`;
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
  const dateIso = dateReading.kind === 'date' ? dateReading.iso : null;
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
    const repeat = reading.repeat;
    (repeat
      ? saveEventSeries(reading.payload, repeat)
      : saveEvent({ id: eventId, ...reading.payload })
    )
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        announce(
          !isNew
            ? 'Changes saved.'
            : repeat
              ? 'The event and its dates are on the calendar.'
              : 'The event is on the calendar.',
        );
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
          Club members can read this event.
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
        <label htmlFor="event-date" className={LABEL}>
          What day?
        </label>
        <input
          id="event-date"
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          value={dateReading.kind === 'date' ? dateReading.iso : ''}
          onChange={(e) => {
            // Keep the calendar's day as written, without a UTC conversion
            // that could move it to yesterday in Pacific time.
            set('date', partsFromIso(e.target.value));
          }}
          className={FIELD}
        />

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

        {/* --------------------------------------------------- repeats */}
        {isNew ? <RepeatFields draft={draft} dateIso={dateIso} set={set} /> : null}

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
        <DescriptionEditor
          id="event-description"
          value={draft.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(next) => {
            set('description', next);
          }}
          placeholder="What happens, who it is for, what to bring, and whether the venue is step-free."
          hintClassName={HINT}
        />

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

/**
 * "Repeats", after Google Calendar (the owner, 2026-10-10): a dropdown that
 * starts at Does not repeat, with Daily, Weekly on <the weekday>, Monthly on
 * <the nth weekday> and Custom. Custom is every N days, weeks or months,
 * ending never, on a date, or after a number of dates.
 *
 * On the page rather than in a pop-up, as the rest of this form is: one more
 * layer is one more thing to dismiss with a switch or at large text, and the
 * choice is read back in a sentence underneath before anything is saved.
 *
 * A native select, as the host is: every phone draws its own picker for it.
 */
function RepeatFields({
  draft,
  dateIso,
  set,
}: {
  draft: EventDraft;
  dateIso: string | null;
  set: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
}) {
  const labels = repeatLabels(dateIso);
  const choices: RepeatChoice[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];
  const reading = dateIso ? readRepeat(draft, dateIso) : null;
  const custom = draft.repeat === 'custom';

  return (
    <>
      <label htmlFor="event-repeat" className={LABEL}>
        Repeats
      </label>
      <select
        id="event-repeat"
        value={draft.repeat}
        onChange={(e) => {
          set('repeat', e.target.value as RepeatChoice);
        }}
        aria-describedby={draft.repeat === 'none' ? undefined : 'event-repeat-summary'}
        className={FIELD}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {labels[choice]}
          </option>
        ))}
      </select>

      {custom ? (
        <div className="mt-2.5 rounded-[13px] border border-line bg-tint/40 px-3.5 pt-0.5 pb-3.5">
          <p className={LABEL} id="event-repeat-every-label">
            Repeats every
          </p>
          <div className="mt-1.5 flex gap-2.5">
            <input
              id="event-repeat-every"
              inputMode="numeric"
              value={draft.repeatEvery}
              onChange={(e) => {
                set('repeatEvery', e.target.value);
              }}
              aria-labelledby="event-repeat-every-label"
              className={`${BOX} w-[5em] flex-none text-center`}
            />
            <select
              value={draft.repeatUnit}
              onChange={(e) => {
                set('repeatUnit', e.target.value as EventDraft['repeatUnit']);
              }}
              aria-label="Days, weeks or months"
              className={`${BOX} min-w-0 flex-1`}
            >
              <option value="day">{draft.repeatEvery.trim() === '1' ? 'day' : 'days'}</option>
              <option value="week">{draft.repeatEvery.trim() === '1' ? 'week' : 'weeks'}</option>
              <option value="month">{draft.repeatEvery.trim() === '1' ? 'month' : 'months'}</option>
            </select>
          </div>

          <fieldset className="mt-1">
            <legend className={LABEL}>Ends</legend>
            <EndChoice value="never" draft={draft} set={set}>
              Never
            </EndChoice>
            <EndChoice value="on" draft={draft} set={set}>
              On
              <input
                type="date"
                aria-label="Last date"
                min={dateIso ?? undefined}
                value={draft.repeatUntil}
                onFocus={() => {
                  set('repeatEnd', 'on');
                }}
                onChange={(e) => {
                  set('repeatUntil', e.target.value);
                  set('repeatEnd', 'on');
                }}
                className={`${BOX} ml-1 min-w-0 flex-1`}
              />
            </EndChoice>
            <EndChoice value="after" draft={draft} set={set}>
              After
              <input
                inputMode="numeric"
                aria-label="Number of dates"
                value={draft.repeatCount}
                onFocus={() => {
                  set('repeatEnd', 'after');
                }}
                onChange={(e) => {
                  set('repeatCount', e.target.value);
                  set('repeatEnd', 'after');
                }}
                className={`${BOX} mx-1 w-[5em] flex-none text-center`}
              />
              dates
            </EndChoice>
          </fieldset>
        </div>
      ) : null}

      {draft.repeat !== 'none' ? (
        <p id="event-repeat-summary" className={HINT}>
          {!dateIso
            ? 'Choose the first date above, and the repeat follows from it.'
            : reading?.ok && reading.rule
              ? describeRepeat(reading.rule, dateIso)
              : reading && !reading.ok
                ? reading.problem
                : null}
        </p>
      ) : null}
    </>
  );
}

/** One "Ends" radio, with whatever goes beside its words. */
function EndChoice({
  value,
  draft,
  set,
  children,
}: {
  value: RepeatEnd;
  draft: EventDraft;
  set: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-2 flex min-h-[44px] items-center gap-2.5 text-[0.9375rem] text-ink">
      <input
        type="radio"
        name="event-repeat-end"
        value={value}
        checked={draft.repeatEnd === value}
        onChange={() => {
          set('repeatEnd', value);
        }}
        className="h-[1.15em] w-[1.15em] flex-none accent-emphasis"
      />
      {children}
    </label>
  );
}
