import { ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BIRTHDAY_ORDER, DateFields, YEAR_FIRST_ORDER } from '@/components/date-fields';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { type DateParts, EMPTY_DATE_PARTS, partsFromIso, readDate } from '@/lib/date-parts';
import { describeThrown } from '@/lib/describe-error';
import { ageFrom, dateLabel, isAdult, MINIMUM_AGE } from '@/lib/injury';
import { MEMBER_TEXT_MAX } from '@/lib/member-limits';
import { usePhotoUrl } from '@/lib/photos';
import { cn } from '@/lib/utils';
import {
  DECLINABLE_DETAILS,
  type DetailKey,
  detailIsFilled,
  loadDetails,
  type MemberDetails,
  removePhoto,
  saveDetails,
  savePhoto,
} from '@/routes/profile/details-api';
import { saveDeclined } from '@/routes/profile/profile-api';
import { COMPLETENESS, EXACT_LEVELS, rangeForExact, US_STATES } from '@/types/domain';

/**
 * Correcting what onboarding asked.
 *
 * Name, photo, birthday, injury and location, all on one page rather than a
 * second wizard. These were answered once, quickly, sometimes by somebody in a
 * difficult moment — coming back to fix one should be a matter of finding the
 * field, not of walking a flow again.
 *
 * Everything is loaded, edited and saved together. There is no draft state to
 * lose, and the whole page is smaller than one screen of the survey.
 */
export default function ProfileDetailsPage() {
  const account = useAccount();
  const navigate = useNavigate();
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What is typed in the date boxes, kept apart from `details` because a
  // half-typed date is not one yet — see `setDate`.
  const [birthParts, setBirthParts] = useState<DateParts>(EMPTY_DATE_PARTS);
  const [injuryParts, setInjuryParts] = useState<DateParts>(EMPTY_DATE_PARTS);

  useEffect(() => {
    if (account.status !== 'member') return;
    void loadDetails().then((result) => {
      if (result.ok) {
        setDetails(result.details);
        setBirthParts(partsFromIso(result.details.birthDate));
        setInjuryParts(
          partsFromIso(result.details.injuryDate, result.details.injuryDatePrecision ?? 'day'),
        );
      } else setError(result.error);
      setLoading(false);
    });
  }, [account.status]);

  // Above the two early returns: a hook runs on every render or none.
  const photo = usePhotoUrl(details?.photoPath ?? null);
  const announce = useAnnounce();

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;

  function set(patch: Partial<MemberDetails>) {
    setDetails((d) => (d ? { ...d, ...patch } : d));
    liftDeclineFor(patch);
  }

  /**
   * Filling in a declined field takes the decline back.
   *
   * Somebody who changes their mind should be able to just answer, without
   * having to notice that a toggle above is still on — and a field holding "San
   * Jose" beside a lit "Rather not say" is the app contradicting itself about
   * what it was told. The Field comment below promised this before anything
   * did it.
   *
   * Persisted immediately, like the toggle, because a decline is not part of
   * the form's Save. One write: the first keystroke clears it, and after that
   * there is no decline left to match.
   */
  function liftDeclineFor(patch: Partial<MemberDetails>) {
    if (!details || !account.userId) return;
    const after = { ...details, ...patch };
    const lifted = DECLINABLE_DETAILS.filter(
      ({ key }) => details.declined.includes(key) && detailIsFilled(after, key),
    ).map(({ key }) => key as string);
    if (lifted.length === 0) return;

    const next = details.declined.filter((key) => !lifted.includes(key));
    setDetails((d) => (d ? { ...d, declined: next } : d));
    void saveDeclined(account.userId, new Set(next)).then((result) => {
      if (result.ok) return;
      setDetails((d) => (d ? { ...d, declined: details.declined } : d));
      setError(result.error ?? 'Could not save that.');
    });
  }

  /**
   * Written on the tap, not on Save.
   *
   * The same reasoning `show_in_browse` carries a few lines down in
   * details-api: the survey writes this column too, and saving the whole array
   * from a form opened beforehand would put back a decline the survey had since
   * withdrawn. Writing only the change, immediately, cannot do that — and a
   * decline is a switch rather than a field you edit and commit.
   */
  function toggleDecline(key: DetailKey) {
    if (!details || !account.userId) return;
    const before = details.declined;
    const next = before.includes(key) ? before.filter((k) => k !== key) : [...before, key];
    set({ declined: next });
    void saveDeclined(account.userId, new Set(next)).then((result) => {
      if (result.ok) return;
      // Put it back, or Me shows a percentage this page cannot account for.
      set({ declined: before });
      setError(result.error ?? 'Could not save that.');
    });
  }

  function submit() {
    if (!details || !account.userId) return;
    setSaving(true);
    setError(null);
    const range = details.exactLevel ? rangeForExact(details.exactLevel) : 'Not sure yet';
    saveDetails(account.userId, details, range)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Could not save that.');
          return;
        }
        // Back to Me on success. Staying put with a "Saved" note leaves people
        // wondering whether there is anything else to do here; leaving says it
        // plainly. A failure keeps them on the page, where the field is.
        // Leaving is silent to somebody who cannot see the page change, so
        // it is said as well.
        announce('Your details are saved.');
        void navigate('/me');
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Could not save that.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function onPhoto(file: File) {
    if (!account.userId) return;
    setSaving(true);
    // Cleared as submit clears it. The photos bucket refuses a file since
    // 20260930040000, and without this the refusal stayed under the next
    // photograph, saying "not saved" about one that was.
    setError(null);
    savePhoto(account.userId, file)
      .then((result) => {
        if (result.ok) set({ photoPath: result.path, photoAlt: null });
        else setError(result.error);
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Could not upload that photo.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const age = details ? ageFrom(details.birthDate) : null;
  const birthReading = readDate(birthParts, { needs: 'day' });
  const injuryReading = readDate(injuryParts, { needs: 'year' });
  // Save waits for a birthday the club accepts and for an injury date that is
  // finished or left empty. Saving a half-typed one would either keep the old
  // date while showing a new one or wipe it, and neither is what was asked.
  const injuryReady = injuryReading.kind === 'date' || injuryReading.kind === 'empty';
  const canSave =
    !saving && !loading && details !== null && isAdult(details.birthDate) && injuryReady;

  return (
    // A form, so Enter saves — the same as onboarding. Somebody who learns the
    // key works there will try it here.
    <main className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-canvas">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) submit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex-none border-line border-b bg-paper px-[18px] pt-4 pb-3">
          <button
            type="button"
            onClick={() => {
              void navigate('/me');
            }}
            className="-ml-1.5 inline-flex items-center gap-0.5 py-1 font-semibold text-[0.875rem] text-emphasis"
          >
            <ChevronLeft className="h-4 w-4" />
            Me
          </button>
          <h1 className="mt-1 font-extrabold font-display text-[1.4375rem] text-ink tracking-[-0.01em]">
            Your details
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto px-[18px] py-4">
          {loading ? (
            <p role="status" className="py-10 text-center text-[0.875rem] text-grey">
              Loading…
            </p>
          ) : !details ? (
            <p className="py-10 text-center text-[0.875rem] text-ink2">{error}</p>
          ) : (
            <>
              <Field
                label="Photo"
                declined={details.declined.includes('photo')}
                onToggleDecline={() => {
                  toggleDecline('photo');
                }}
              >
                <div className="flex items-center gap-3.5">
                  <label className="grid h-[72px] w-[72px] flex-none cursor-pointer place-items-center overflow-hidden rounded-[22px] border-[1.6px] border-emphasis border-dashed bg-paper">
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-extrabold font-display text-[1.5rem] text-emphasis">
                        +
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      // The label around it holds only the picture (alt="")
                      // or a "+", so without this the control has no name.
                      aria-label={details.photoPath ? 'Change your photo' : 'Choose a photo'}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhoto(file);
                      }}
                    />
                  </label>
                  {details.photoPath ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!account.userId) return;
                        setError(null);
                        void removePhoto(account.userId).then((result) => {
                          // Only once it is gone: a refusal keeps the photo on
                          // screen, where it still is.
                          if (result.ok) set({ photoPath: null, photoAlt: null });
                          else setError(result.error ?? 'The photograph was not removed.');
                        });
                      }}
                      data-target="small"
                      className="rounded-full bg-tint px-3 py-1.5 font-semibold text-[0.78125rem] text-emphasis"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-[0.78125rem] text-grey leading-[1.45]">
                      Without one, your card is made from your initials.
                    </span>
                  )}
                </div>
              </Field>

              {/* Asked only once there is a picture to describe. Every avatar of
                  this member reads it; without it they are alt="", with the
                  name beside them. */}
              {details.photoPath ? (
                <Field label="Describe your photo" htmlFor="d-photo-alt">
                  <Input
                    id="d-photo-alt"
                    value={details.photoAlt ?? ''}
                    maxLength={MEMBER_TEXT_MAX.photo_alt}
                    describedBy="d-photo-alt-hint"
                    onChange={(v) => {
                      set({ photoAlt: v });
                    }}
                  />
                  <p
                    id="d-photo-alt-hint"
                    className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]"
                  >
                    For members who use a screen reader, who hear this instead of seeing the
                    picture. Optional — “Me in my chair at Ocean Beach” is plenty.
                  </p>
                </Field>
              ) : null}

              <Field label="Name" htmlFor="d-name">
                <Input
                  id="d-name"
                  maxLength={MEMBER_TEXT_MAX.display_name}
                  value={details.displayName}
                  onChange={(v) => {
                    set({ displayName: v });
                  }}
                />
              </Field>

              <Field label="Birthday" labelId="d-birthday-label">
                <DateFields
                  id="d-birthday"
                  labelledBy="d-birthday-label"
                  order={BIRTHDAY_ORDER}
                  birthday
                  parts={birthParts}
                  reading={birthReading}
                  onChange={(next) => {
                    setBirthParts(next);
                    const read = readDate(next, { needs: 'day' });
                    set({ birthDate: read.kind === 'date' ? read.iso : '' });
                  }}
                />
                {birthReading.kind === 'invalid' ? null : birthReading.kind !== 'date' ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">
                    {birthReading.kind === 'partial'
                      ? birthReading.need
                      : 'Add the month, day and year.'}
                  </p>
                ) : !isAdult(details.birthDate) ? (
                  <p
                    role="alert"
                    className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]"
                  >
                    The club is {MINIMUM_AGE}+. A correction cannot make somebody younger than that.
                  </p>
                ) : age !== null ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">
                    {dateLabel(details.birthDate, 'day')}. Members see {age}, never the date itself.
                  </p>
                ) : null}
              </Field>

              <Field
                label="Level of injury"
                htmlFor="d-level"
                declined={details.declined.includes('exactLevel')}
                onToggleDecline={() => {
                  toggleDecline('exactLevel');
                }}
              >
                <Select
                  id="d-level"
                  value={details.exactLevel ?? ''}
                  onChange={(v) => {
                    set({ exactLevel: (v || null) as MemberDetails['exactLevel'] });
                  }}
                >
                  <option value="">Not set</option>
                  {EXACT_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
                {details.exactLevel && details.exactLevel !== 'Do not know' ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">
                    Browsed under {rangeForExact(details.exactLevel)}.
                  </p>
                ) : null}
              </Field>

              <Field label="Complete or incomplete">
                <div className="flex flex-wrap gap-2">
                  {COMPLETENESS.map((c) => (
                    <Chip
                      key={c}
                      selected={details.completeness === c}
                      onClick={() => {
                        set({ completeness: c });
                      }}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field
                label="When were you injured?"
                labelId="d-injury-label"
                declined={details.declined.includes('injuryDate')}
                onToggleDecline={() => {
                  toggleDecline('injuryDate');
                }}
              >
                <DateFields
                  id="d-injury"
                  labelledBy="d-injury-label"
                  hint="The year on its own is a complete answer."
                  order={YEAR_FIRST_ORDER}
                  parts={injuryParts}
                  reading={injuryReading}
                  onChange={(next) => {
                    setInjuryParts(next);
                    const read = readDate(next, { needs: 'year' });
                    // Only a finished date or a cleared one is recorded; one
                    // still being typed leaves the record alone and holds Save.
                    if (read.kind === 'date') {
                      set({ injuryDate: read.iso, injuryDatePrecision: read.precision });
                    } else if (read.kind === 'empty') {
                      set({ injuryDate: null, injuryDatePrecision: null });
                    }
                  }}
                />
                {injuryReading.kind === 'partial' ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">{injuryReading.need}</p>
                ) : injuryReading.kind === 'date' ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">
                    {dateLabel(injuryReading.iso, injuryReading.precision)}
                  </p>
                ) : null}
              </Field>

              <Field
                label="State"
                htmlFor="d-state"
                declined={details.declined.includes('state')}
                onToggleDecline={() => {
                  toggleDecline('state');
                }}
              >
                <Select
                  id="d-state"
                  value={details.state}
                  onChange={(v) => {
                    set({ state: v });
                  }}
                >
                  {US_STATES.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="City or town"
                htmlFor="d-city"
                declined={details.declined.includes('city')}
                onToggleDecline={() => {
                  toggleDecline('city');
                }}
              >
                <Input
                  id="d-city"
                  maxLength={MEMBER_TEXT_MAX.city}
                  value={details.city ?? ''}
                  onChange={(v) => {
                    set({ city: v });
                  }}
                />
              </Field>

              <div className="h-4" />
            </>
          )}
        </div>

        <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
          {error && details ? (
            <p role="alert" className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSave}
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-action font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi disabled:opacity-40 disabled:hover:bg-action"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
          </button>
        </footer>
      </form>
    </main>
  );
}

/**
 * A labelled field, with an optional "Rather not say".
 *
 * The toggle is offered on the five the ring counts and on nothing else. Name
 * and birthday have none, because the database refuses to record a decline for
 * them — a row cannot exist without a name and the 18+ trigger cannot do its
 * job without a birthday — and offering a control the database would reject is
 * worse than not offering one.
 *
 * The control below stays editable when declined, and filling it in lifts the
 * decline — see `liftDeclineFor`. Somebody who changes their mind should be
 * able to just answer.
 */
function Field({
  label,
  htmlFor,
  labelId,
  declined,
  onToggleDecline,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** For a group of controls, which name themselves by pointing at the label. */
  labelId?: string;
  /** Absent where the field cannot be declined at all. */
  declined?: boolean;
  onToggleDecline?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="font-bold text-[0.8125rem] text-ink">
            {label}
          </label>
        ) : (
          <span id={labelId} className="font-bold text-[0.8125rem] text-ink">
            {label}
          </span>
        )}
        {onToggleDecline ? (
          <button
            type="button"
            onClick={onToggleDecline}
            aria-pressed={declined === true}
            className={cn(
              'rounded-full px-2 py-0.5 font-semibold text-[0.75rem] transition-colors',
              declined
                ? 'bg-tint text-emphasis hover:bg-line'
                : 'text-grey hover:bg-tint hover:text-ink2',
            )}
          >
            {declined ? 'Rather not say ✓' : 'Rather not say'}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const CONTROL =
  'w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none focus:border-emphasis';

function Input({
  id,
  maxLength,
  describedBy,
  value,
  onChange,
}: {
  id: string;
  maxLength?: number;
  describedBy?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      id={id}
      maxLength={maxLength}
      aria-describedby={describedBy}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className={CONTROL}
    />
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      className={CONTROL}
    >
      {children}
    </select>
  );
}

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-2 font-semibold text-[0.84375rem]',
        'transition-colors',
        selected
          ? 'bg-action text-white hover:bg-action-hi'
          : 'border border-line bg-paper text-ink2 hover:bg-tint',
      )}
    >
      {children}
    </button>
  );
}
