import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AccountProblem } from '@/components/account-problem';
import { AppNav } from '@/components/app-nav';
import { BIRTHDAY_ORDER, DateFields } from '@/components/date-fields';
import { GooglePhotoOffer } from '@/components/google-photo-offer';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { type DateParts, EMPTY_DATE_PARTS, partsFromIso, readDate } from '@/lib/date-parts';
import { describeThrown } from '@/lib/describe-error';
import { geocodeZip } from '@/lib/geocode';
import { googlePhotoUrl, useGooglePhoto } from '@/lib/google-photo';
import {
  ageFrom,
  dateLabel,
  injuryBandOf,
  injuryBandText,
  injuryStageOf,
  isAdult,
  MINIMUM_AGE,
} from '@/lib/injury';
import { MEMBER_TEXT_MAX } from '@/lib/member-limits';
import { usePhotoUrl } from '@/lib/photos';
import { signInDoor } from '@/lib/sign-in-destination';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { SpinalCordFields } from '@/routes/onboarding/spinal-cord-fields';
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
import { loadAnswers, saveDeclined } from '@/routes/profile/profile-api';
import {
  type DetailPart,
  isDetailPart,
  nextStep,
  PART_TITLES,
  profilePercent,
  stepBeside,
  stepHref,
  stepPosition,
} from '@/routes/profile/progress';
import type { Answers } from '@/routes/profile/questions';
import { StepTop } from '@/routes/profile/step-top';
import { hasNoInjury, rangeForExact, US_STATES } from '@/types/domain';

/**
 * One part of what onboarding asked: photo, name, birthday, injury or where
 * you live (`?part=`), as Your profile lists them (the owner, 2026-11-12).
 *
 * Framed as the questions are (the owner, 2026-11-14): one bar, one percentage,
 * Continue on to the next step. `?walk=1` goes to the next open step, otherwise
 * to the next in order; `?only=1` (Home's card) is this part, then back.
 * Without a part (an old link or a reminder) it goes where the profile was left.
 */
export default function ProfileDetailsPage() {
  const account = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  // From Home's card, back there; otherwise Your profile, where Me opens it.
  const fromHome = Boolean((location.state as { oneScreen?: boolean } | null)?.oneScreen);
  const leaveTo = fromHome ? '/home' : '/profile/answers';
  const [params] = useSearchParams();
  const partParam = params.get('part');
  const part: DetailPart | null = isDetailPart(partParam) ? partParam : null;
  const walk = params.has('walk');
  const only = params.has('only') || fromHome;
  // For the percentage, and what comes after this part.
  const [survey, setSurvey] = useState<{ answers: Answers; declined: Set<string> } | null>(null);
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
    // Saved over: the row as it is now.
    void loadDetails({ fresh: true }).then((result) => {
      if (result.ok) {
        setDetails(result.details);
        setBirthParts(partsFromIso(result.details.birthDate));
        setInjuryParts(
          partsFromIso(result.details.injuryDate, result.details.injuryDatePrecision ?? 'day'),
        );
      } else setError(result.error);
      setLoading(false);
    });
    void loadAnswers().then((result) => {
      if (result.ok) setSurvey({ answers: result.answers, declined: result.declined });
    });
  }, [account.status]);

  // Above the two early returns: a hook runs on every render or none.
  const photo = usePhotoUrl(details?.photoPath ?? null);
  const announce = useAnnounce();
  // A Google account's photo, offered beside the photo control.
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [usedGoogle, setUsedGoogle] = useState(false);
  const google = useGooglePhoto(googleUrl);
  useEffect(() => {
    if (account.status !== 'member') return;
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        setGoogleUrl(googlePhotoUrl(data.session?.user));
      });
  }, [account.status]);

  if (account.status === 'error') return <AccountProblem account={account} />;
  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member')
    return (
      <Navigate to={signInDoor(`${location.pathname}${location.search}${location.hash}`)} replace />
    );
  if (!part) return <Navigate to={`/profile/next${location.search}`} replace />;
  const shows = (p: DetailPart) => p === part;

  const here = { kind: 'details', part } as const;

  /** The next open step when walking, else the next in order; Your profile after the last. */
  function onward(after: MemberDetails | null) {
    if (only || !after) return leaveTo;
    if (!survey) return walk ? '/profile/next' : '/profile/answers';
    const step = walk
      ? nextStep(after, survey.answers, survey.declined, here)
      : stepBeside(here, 1, survey.answers);
    return step ? stepHref(step, walk) : '/profile/answers';
  }

  function set(patch: Partial<MemberDetails>) {
    setDetails((d) => (d ? { ...d, ...patch } : d));
    liftDeclineFor(patch);
  }

  /**
   * Kept for the map's zip middle (20261029040000). A complete one fills in
   * the city and state too, as joining does; they can still be changed.
   */
  function setZip(value: string) {
    const zip = value.replace(/\D/g, '').slice(0, 5);
    set({ zip });
    if (zip.length !== 5) return;
    void geocodeZip(zip).then((place) => {
      if (!place) return;
      setDetails((d) => (d?.zip === zip ? { ...d, city: place.city, state: place.state } : d));
    });
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

  /** Saves, then goes on (or to `to`: Back, or the way out). */
  function submit(to?: string) {
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
        announce('Saved.');
        void navigate(to ?? onward(details), { replace: walk });
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Could not save that.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function onPhoto(file: File, fromGoogle = false) {
    if (!account.userId) return;
    setSaving(true);
    // Cleared as submit clears it. The photos bucket refuses a file since
    // 20260930040000, and without this the refusal stayed under the next
    // photograph, saying "not saved" about one that was.
    setError(null);
    savePhoto(account.userId, file)
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        set({ photoPath: result.path, photoAlt: null });
        setUsedGoogle(fromGoogle);
        if (fromGoogle) announce('Your Google photo is saved.');
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
  const { position, total } = survey
    ? stepPosition(here, survey.answers)
    : { position: 0, total: 0 };
  const percent =
    details && survey ? profilePercent(details, survey.answers, survey.declined) : null;
  const before = only || !survey ? null : stepBeside(here, -1, survey.answers);
  const isLast =
    !only &&
    details !== null &&
    survey !== null &&
    (walk
      ? nextStep(details, survey.answers, survey.declined, here) === null
      : stepBeside(here, 1, survey.answers) === null);
  /** Saved on the way, when it can be; a half-typed date is left behind. */
  function leave(to: string) {
    if (canSave) submit(to);
    else void navigate(to);
  }

  return (
    // The tab bar as the questions have it; a tab saves this part first.
    <div className="flex h-dvh flex-col bg-canvas lg:h-auto lg:min-h-dvh">
      <div
        className="contents"
        onClickCapture={() => {
          if (canSave && account.userId)
            void saveDetails(
              account.userId,
              details,
              details.exactLevel ? rangeForExact(details.exactLevel) : 'Not sure yet',
            ).catch(() => undefined);
        }}
      >
        <AppNav />
      </div>
      {/* A form, so Enter saves — the same as onboarding. */}
      <main className="mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) submit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <StepTop
            onBack={
              before
                ? () => {
                    leave(stepHref(before, walk));
                  }
                : null
            }
            doneLabel={walk ? 'Done for now' : only ? 'Back' : 'Finish'}
            onDone={() => {
              leave(leaveTo);
            }}
            disabled={saving}
            position={position}
            total={total}
            percent={percent}
          />

          <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-3 lg:flex-none lg:overflow-visible">
            <h1 className="font-extrabold font-display text-[1.4375rem] text-ink leading-tight tracking-[-0.01em]">
              {PART_TITLES[part]}
            </h1>
            {loading ? (
              <p role="status" className="py-10 text-center text-[0.875rem] text-grey">
                Loading…
              </p>
            ) : !details ? (
              <p className="py-10 text-center text-[0.875rem] text-ink2">{error}</p>
            ) : (
              <>
                {shows('photo') ? (
                  <DetailsSection>
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
                      {google && !usedGoogle ? (
                        <GooglePhotoOffer
                          photo={google}
                          disabled={saving}
                          className="mt-3"
                          onUse={() => {
                            onPhoto(google.file, true);
                          }}
                        />
                      ) : null}
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
                  </DetailsSection>
                ) : null}

                {shows('name') ? (
                  <DetailsSection>
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
                  </DetailsSection>
                ) : null}

                {shows('birthday') ? (
                  <DetailsSection>
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
                          The club is {MINIMUM_AGE}+. A correction cannot make somebody younger than
                          that.
                        </p>
                      ) : age !== null ? (
                        <p className="mt-1.5 text-[0.75rem] text-grey">
                          {dateLabel(details.birthDate, 'day')}. Members see {age}, never the date
                          itself.
                        </p>
                      ) : null}
                    </Field>
                  </DetailsSection>
                ) : null}
                {shows('injury') ? (
                  <DetailsSection>
                    <Field
                      label="Disability details"
                      labelId="d-spinal-cord-label"
                      declined={details.declined.includes('exactLevel')}
                      onToggleDecline={() => {
                        toggleDecline('exactLevel');
                      }}
                    >
                      <SpinalCordFields
                        answer={details}
                        onChange={(patch) => {
                          set(patch);
                        }}
                        browsedUnder="Browsed under"
                      />
                    </Field>

                    {hasNoInjury(details.injuryType) ? null : (
                      <Field
                        label={
                          details.injuryType === 'condition'
                            ? 'When did it start, or when were you diagnosed?'
                            : 'When were you injured?'
                        }
                        labelId="d-injury-label"
                        declined={details.declined.includes('injuryDate')}
                        onToggleDecline={() => {
                          toggleDecline('injuryDate');
                        }}
                      >
                        <DateFields
                          id="d-injury"
                          labelledBy="d-injury-label"
                          hint="For example, 6 14 2013 — or just 2013."
                          order={BIRTHDAY_ORDER}
                          yearAlone
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
                        <InjuryDateShown
                          details={details}
                          onChange={(showInjuryDate) => {
                            set({ showInjuryDate });
                          }}
                        />
                      </Field>
                    )}
                  </DetailsSection>
                ) : null}
                {shows('place') ? (
                  <DetailsSection>
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

                    <Field label="ZIP code" htmlFor="d-zip">
                      <input
                        id="d-zip"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={5}
                        aria-describedby="d-zip-hint"
                        value={details.zip}
                        onChange={(e) => {
                          setZip(e.target.value);
                        }}
                        className={CONTROL}
                      />
                      <p id="d-zip-hint" className="mt-1.5 text-[0.75rem] text-grey">
                        Only you see it. The map counts you at its middle, never closer; leave it
                        empty to be counted by city.
                      </p>
                    </Field>

                    <div className="h-4" />
                  </DetailsSection>
                ) : null}
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
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : only ? (
                'Save'
              ) : isLast ? (
                'Finish'
              ) : (
                'Continue'
              )}
            </button>
            {only ? null : (
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void navigate(onward(details), { replace: walk });
                  }}
                  className="flex min-h-[38px] flex-1 basis-[9rem] items-center justify-center rounded-[13px] font-bold text-[0.84375rem] text-grey transition-colors hover:bg-tint hover:text-ink2"
                >
                  Skip this one
                </button>
              </div>
            )}
          </footer>
        </form>
      </main>
    </div>
  );
}

/** One part, on the page as a question screen's are; the heading names it. */
function DetailsSection({ children }: { children: React.ReactNode }) {
  return <div className="mt-6">{children}</div>;
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
              'min-h-[44px] rounded-full px-3 py-2 font-semibold text-[0.75rem] transition-colors',
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

/**
 * Whether members see the injury date or only how long ago (the owner,
 * 2026-11-17: "Have a selector in details for showing the injury date").
 * How long ago unless the member chooses the date; each option says what
 * members would read.
 */
function InjuryDateShown({
  details,
  onChange,
}: {
  details: MemberDetails;
  onChange: (showInjuryDate: boolean) => void;
}) {
  const stage = injuryStageOf(details);
  const band = injuryBandOf(details);
  const date =
    details.injuryDate && details.injuryDatePrecision
      ? dateLabel(details.injuryDate, details.injuryDatePrecision)
      : null;
  if (!stage || band === null || !date) return null;
  return (
    <label className="mt-3 block">
      <span className="mb-1.5 block font-semibold text-[0.8125rem] text-ink">What members see</span>
      <select
        value={details.showInjuryDate ? 'date' : 'stage'}
        onChange={(event) => {
          onChange(event.target.value === 'date');
        }}
        className="min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 text-[1rem] text-ink outline-none focus:border-emphasis"
      >
        <option value="stage">Only the group: {injuryBandText(band, details.injuryType)}</option>
        <option value="date">The date too: {date}</option>
      </select>
    </label>
  );
}
