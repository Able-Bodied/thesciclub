import { ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { ageFrom, isAdult, latestAdultBirthDate, MINIMUM_AGE } from '@/lib/injury';
import { photoUrlFor } from '@/lib/photos';
import { cn } from '@/lib/utils';
import {
  loadDetails,
  type MemberDetails,
  removePhoto,
  saveDetails,
  savePhoto,
} from '@/routes/profile/details-api';
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
        setError(e instanceof Error ? e.message : 'Could not save that.');
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
        setError(e instanceof Error ? e.message : 'Could not upload that photo.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const age = details ? ageFrom(details.birthDate) : null;
  const photo = photoUrlFor(details?.photoPath ?? null);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-canvas">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-4 pb-3">
        <button
          type="button"
          onClick={() => {
            void navigate('/me');
          }}
          className="-ml-1.5 inline-flex items-center gap-0.5 py-1 font-semibold text-[14px] text-navy"
        >
          <ChevronLeft className="h-4 w-4" />
          Me
        </button>
        <h1 className="mt-1 font-extrabold font-head text-[23px] text-ink tracking-[-0.02em]">
          Your details
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto px-[18px] py-4">
        {loading ? (
          <p className="py-10 text-center text-[14px] text-grey">Loading…</p>
        ) : !details ? (
          <p className="py-10 text-center text-[14px] text-ink2">{error}</p>
        ) : (
          <>
            <Field label="Photo">
              <div className="flex items-center gap-3.5">
                <label className="grid h-[72px] w-[72px] flex-none cursor-pointer place-items-center overflow-hidden rounded-[22px] border-[1.6px] border-navy border-dashed bg-paper">
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-extrabold font-head text-[24px] text-navy">+</span>
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
                    className="rounded-full bg-tint px-3 py-1.5 font-semibold text-[12.5px] text-navy"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-[12.5px] text-grey leading-[1.45]">
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
                <p className="mt-1.5 text-[12.5px] text-destructive leading-[1.45]">
                  The club is {MINIMUM_AGE}+. A correction cannot make somebody younger than that.
                </p>
              ) : age !== null ? (
                <p className="mt-1.5 text-[12px] text-grey">
                  Members see {age}, never the date itself.
                </p>
              ) : null}
            </Field>

            <Field label="Level of injury" htmlFor="d-level">
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
                <p className="mt-1.5 text-[12px] text-grey">
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

            <Field label="When were you injured?" htmlFor="d-injury">
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
                <p className="mt-1.5 text-[12px] text-grey">
                  You gave {details.injuryDate.slice(0, 4)} only. Changing this records an exact
                  date.
                </p>
              ) : null}
            </Field>

            <Field label="State" htmlFor="d-state">
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

            <Field label="City or town" htmlFor="d-city">
              <Input
                id="d-city"
                value={details.city ?? ''}
                onChange={(v) => {
                  set({ city: v });
                }}
              />
            </Field>

            <button
              type="button"
              onClick={() => {
                set({ showInBrowse: !details.showInBrowse });
              }}
              className="mt-5 flex w-full items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 text-left"
            >
              <span className="flex-1">
                <span className="block font-extrabold font-head text-[14.5px]">
                  Show me in the deck
                </span>
                <span className="mt-0.5 block text-[12.5px] text-grey leading-[1.45]">
                  Turn this off and no other member can find you. You can still browse.
                </span>
              </span>
              <span
                className={cn(
                  'relative h-[26px] w-[44px] flex-none rounded-full',
                  details.showInBrowse ? 'bg-navy' : 'bg-line',
                )}
              >
                <span
                  className={cn(
                    'absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left]',
                    details.showInBrowse ? 'left-[21px]' : 'left-[3px]',
                  )}
                />
              </span>
            </button>
            <div className="h-4" />
          </>
        )}
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        {error && details ? (
          <p className="mb-2.5 text-[13px] text-destructive leading-[1.45]">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={saving || loading || !details || !isAdult(details.birthDate)}
          onClick={submit}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-navy font-bold font-head text-[15px] text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
        </button>
      </footer>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block font-bold text-[13px] text-ink">
          {label}
        </label>
      ) : (
        <span className="block font-bold text-[13px] text-ink">{label}</span>
      )}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const CONTROL =
  'w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-navy';

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
        'rounded-full px-3.5 py-2 font-semibold text-[13.5px]',
        selected ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
      )}
    >
      {children}
    </button>
  );
}
