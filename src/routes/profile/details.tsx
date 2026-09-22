import { ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { ageFrom, isAdult, latestAdultBirthDate, MINIMUM_AGE } from '@/lib/injury';
import { photoUrlFor } from '@/lib/photos';
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

  useEffect(() => {
    if (account.status !== 'member') return;
    void loadDetails().then((result) => {
      if (result.ok) setDetails(result.details);
      else setError(result.error);
      setLoading(false);
    });
  }, [account.status]);

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
    savePhoto(account.userId, file)
      .then((result) => {
        if (result.ok) set({ photoPath: result.path });
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
  const photo = photoUrlFor(details?.photoPath ?? null);

  return (
    // A form, so Enter saves — the same as onboarding. Somebody who learns the
    // key works there will try it here.
    <main className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-canvas">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving && !loading && details && isAdult(details.birthDate)) submit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex-none border-line border-b bg-paper px-[18px] pt-4 pb-3">
          <button
            type="button"
            onClick={() => {
              void navigate('/me');
            }}
            className="-ml-1.5 inline-flex items-center gap-0.5 py-1 font-semibold text-[0.875rem] text-navy"
          >
            <ChevronLeft className="h-4 w-4" />
            Me
          </button>
          <h1 className="mt-1 font-extrabold font-head text-[1.4375rem] text-ink tracking-[-0.02em]">
            Your details
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto px-[18px] py-4">
          {loading ? (
            <p className="py-10 text-center text-[0.875rem] text-grey">Loading…</p>
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
                  <label className="grid h-[72px] w-[72px] flex-none cursor-pointer place-items-center overflow-hidden rounded-[22px] border-[1.6px] border-navy border-dashed bg-paper">
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-extrabold font-head text-[1.5rem] text-navy">+</span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
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
                        void removePhoto(account.userId).then(() => {
                          set({ photoPath: null });
                        });
                      }}
                      className="rounded-full bg-tint px-3 py-1.5 font-semibold text-[0.78125rem] text-navy"
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

              <Field label="Name" htmlFor="d-name">
                <Input
                  id="d-name"
                  value={details.displayName}
                  onChange={(v) => {
                    set({ displayName: v });
                  }}
                />
              </Field>

              <Field label="Birthday" htmlFor="d-birthday">
                <Input
                  id="d-birthday"
                  type="date"
                  max={latestAdultBirthDate()}
                  value={details.birthDate}
                  onChange={(v) => {
                    set({ birthDate: v });
                  }}
                />
                {!isAdult(details.birthDate) ? (
                  <p className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]">
                    The club is {MINIMUM_AGE}+. A correction cannot make somebody younger than that.
                  </p>
                ) : age !== null ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">
                    Members see {age}, never the date itself.
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
                htmlFor="d-injury"
                declined={details.declined.includes('injuryDate')}
                onToggleDecline={() => {
                  toggleDecline('injuryDate');
                }}
              >
                <Input
                  id="d-injury"
                  type="date"
                  value={details.injuryDate ?? ''}
                  onChange={(v) => {
                    set({
                      injuryDate: v || null,
                      // Editing here gives a full date, so the precision follows.
                      injuryDatePrecision: v ? 'day' : null,
                    });
                  }}
                />
                {details.injuryDatePrecision === 'year' && details.injuryDate ? (
                  <p className="mt-1.5 text-[0.75rem] text-grey">
                    You gave {details.injuryDate.slice(0, 4)} only. Changing this records an exact
                    date.
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
            <p className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={saving || loading || !details || !isAdult(details.birthDate)}
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-navy font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-navy-hi disabled:opacity-40 disabled:hover:bg-navy"
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
  declined,
  onToggleDecline,
  children,
}: {
  label: string;
  htmlFor?: string;
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
          <span className="font-bold text-[0.8125rem] text-ink">{label}</span>
        )}
        {onToggleDecline ? (
          <button
            type="button"
            onClick={onToggleDecline}
            aria-pressed={declined === true}
            className={cn(
              'rounded-full px-2 py-0.5 font-semibold text-[0.75rem] transition-colors',
              declined
                ? 'bg-tint text-navy hover:bg-line'
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
  'w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none focus:border-navy';

function Input({
  id,
  type,
  max,
  value,
  onChange,
}: {
  id: string;
  type?: string;
  max?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      id={id}
      type={type}
      max={max}
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
          ? 'bg-navy text-white hover:bg-navy-hi'
          : 'border border-line bg-paper text-ink2 hover:bg-tint',
      )}
    >
      {children}
    </button>
  );
}
