import { Loader2, LocateFixed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BIRTHDAY_ORDER, DateFields } from '@/components/date-fields';
import { type DateParts, readDate } from '@/lib/date-parts';
import { geocodeZip, reverseGeocode } from '@/lib/geocode';
import { ageFrom, dateLabel, isAdult, MINIMUM_AGE } from '@/lib/injury';
import { MEMBER_TEXT_MAX } from '@/lib/member-limits';
import { formatPhoneInput } from '@/lib/phone';
import {
  isValidUsername,
  normalizeUsername,
  suggestUsernames,
  USERNAME_MAX,
  usernameAvailable,
} from '@/lib/usernames';
import { Chip, Field, Fine, Question, Sub, useAutoFocus } from '@/routes/onboarding/chrome';
import { SpinalCordFields } from '@/routes/onboarding/spinal-cord-fields';
import type { OnboardingData } from '@/routes/onboarding/types';
import { birthPartsOf, injuryDateOf, injuryPartsOf } from '@/routes/onboarding/types';
import { US_STATES } from '@/types/domain';

/**
 * The questions.
 *
 * Two things run through all of them. Every question says why it is being
 * asked, because a form that explains itself is answered more honestly than one
 * that does not — and several of these are genuinely personal. And answers are
 * reflected straight back as a derived card where there is something to derive,
 * so the flow reads as a conversation rather than a spreadsheet.
 */

interface StepProps {
  data: OnboardingData;
  set: (patch: Partial<OnboardingData>) => void;
}

/**
 * A link out of a step that leaves it where it was. In the same tab,
 * reading the terms would throw away the number and the ticks, and the way
 * back would start again at the welcome screen.
 */
export function NewTabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="font-bold text-emphasis underline decoration-2 underline-offset-2"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function NameStep({ data, set }: StepProps) {
  const nameRef = useAutoFocus();
  return (
    <>
      {/* The owner, 2026-10-15: the whole name, asked plainly. */}
      <Question>What is your name?</Question>
      <Field
        ref={nameRef}
        id="name"
        autoComplete="name"
        placeholder="ex. Ajay Shenoy"
        maxLength={MEMBER_TEXT_MAX.display_name}
        value={data.displayName}
        onChange={(e) => {
          set({ displayName: e.target.value });
        }}
      />
    </>
  );
}

/**
 * The @name, with free suggestions made from the name just given.
 *
 * The availability is asked after a short pause in typing, and spoken by a
 * live region, so somebody who cannot see the field change hears "@alex is
 * available" without leaving it. A name edited after the answer arrives is
 * simply not yet checked: the step goes on only when the answer is for the
 * name now in the box (`usernameChecked`).
 */
export function UsernameStep({ data, set }: StepProps) {
  const usernameRef = useAutoFocus();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<'idle' | 'checking' | 'available' | 'taken' | 'unknown'>(
    'idle',
  );
  const { username, displayName } = data;

  useEffect(() => {
    let cancelled = false;
    void suggestUsernames(displayName).then((names) => {
      if (!cancelled) setSuggestions(names);
    });
    return () => {
      cancelled = true;
    };
  }, [displayName]);

  // The first suggestion, the whole name with dots (20261015030000), is
  // chosen for them (the owner, 2026-10-15), so Continue is all it takes.
  // Once, and only into an empty box: a name they typed or chose stays, and
  // clearing the box to type their own does not bring it back. The club
  // only suggests names it has just found free, so it counts as checked.
  const preselected = useRef(false);
  useEffect(() => {
    const first = suggestions[0];
    if (preselected.current || !first) return;
    preselected.current = true;
    if (username === '') set({ username: first, usernameChecked: first });
  }, [suggestions, username, set]);

  useEffect(() => {
    if (!isValidUsername(username)) {
      setVerdict('idle');
      return;
    }
    if (data.usernameChecked === username) {
      setVerdict('available');
      return;
    }
    setVerdict('checking');
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void usernameAvailable(username).then((free) => {
        if (cancelled) return;
        if (free === null) setVerdict('unknown');
        else if (free) {
          setVerdict('available');
          set({ usernameChecked: username });
        } else setVerdict('taken');
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, data.usernameChecked, set]);

  const message = !username
    ? ''
    : !isValidUsername(username)
      ? '3 to 20 letters, numbers, dots or underscores, not starting or ending with a dot or underscore.'
      : verdict === 'checking'
        ? `Checking @${username}…`
        : verdict === 'available'
          ? `@${username} is available.`
          : verdict === 'taken'
            ? `@${username} is taken. Try another.`
            : verdict === 'unknown'
              ? 'Could not check that name. Try again.'
              : '';

  return (
    <>
      <Question>Pick a username</Question>
      <Sub>Other members see it as @name on your profile. You can change it later.</Sub>
      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => (
              <Chip
                key={name}
                selected={username === name}
                onClick={() => {
                  set({ username: name, usernameChecked: name });
                }}
              >
                @{name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <label htmlFor="username" className="mt-5 block font-bold text-[0.8125rem] text-ink">
        Username
      </label>
      <Field
        ref={usernameRef}
        id="username"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="alex"
        maxLength={USERNAME_MAX}
        value={username}
        onChange={(e) => {
          set({ username: normalizeUsername(e.target.value) });
        }}
      />
      <p
        role="status"
        aria-live="polite"
        className={
          verdict === 'taken' || (username && !isValidUsername(username))
            ? 'mt-2 text-[0.8125rem] text-destructive leading-[1.45]'
            : 'mt-2 text-[0.8125rem] text-ink2 leading-[1.45]'
        }
      >
        {message}
      </p>
    </>
  );
}

/**
 * A number for event hosts, and optional.
 *
 * Not verified and not an account: the club never texts it. The host of an
 * event gets it, with the email, when the member chooses Going.
 */
export function PhoneForEventsStep({ data, set }: StepProps) {
  const phoneRef = useAutoFocus();
  return (
    <>
      {/* The owner, 2026-10-15. Nothing here about texting: the club sends
          no texts yet (see the privacy policy), so it may not say it will. */}
      <Question>What is your phone number?</Question>
      <Sub>
        Optional. Event hosts can see your number if you say you are going to their event. Nobody
        else sees it.
      </Sub>
      <label htmlFor="phone" className="mt-5 block font-bold text-[0.8125rem] text-ink">
        Phone number
      </label>
      <div className="flex items-stretch gap-2.5">
        <span className="mt-2.5 grid flex-none place-items-center rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 font-semibold text-[1rem] text-ink2">
          +1
        </span>
        <Field
          ref={phoneRef}
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(408) 555-0112"
          value={data.phone}
          onChange={(e) => {
            set({ phone: formatPhoneInput(e.target.value) });
          }}
        />
      </div>
      <Fine>You can add one later in the “Me” tab.</Fine>
    </>
  );
}

export function BirthdayStep({ data, set }: StepProps) {
  const monthRef = useAutoFocus();
  const parts = birthPartsOf(data);
  const reading = readDate(parts, { needs: 'day' });
  const age = ageFrom(data.birthDate || null);
  const entered = data.birthDate !== '';
  const adult = isAdult(data.birthDate || null);

  function onChange(next: DateParts) {
    const read = readDate(next, { needs: 'day' });
    set({
      birthMonth: next.month,
      birthDay: next.day,
      birthYear: next.year,
      birthDate: read.kind === 'date' ? read.iso : '',
    });
  }

  return (
    <>
      <Question>When is your birthday?</Question>
      <Sub>
        Age matters for matching — a 28-year-old and a 68-year-old with the same injury are living
        different days. The club is {MINIMUM_AGE}+.
      </Sub>
      <div className="mt-5">
        <DateFields
          id="birthday"
          legend="Your birthday"
          hint="For example, 5 27 1996."
          order={BIRTHDAY_ORDER}
          birthday
          parts={parts}
          reading={reading}
          onChange={onChange}
          firstRef={monthRef}
        />
      </div>
      {entered && !adult ? (
        <div className="mt-3.5 rounded-[17px] border border-destructive/30 bg-destructive/5 p-3.5 text-[0.8375rem] text-ink2 leading-[1.5]">
          <b className="font-bold text-ink">The SCI Club is for adults.</b> Everything inside it is
          written by adults for adults, and none of it is moderated for a younger reader. You will
          be welcome the year you turn {MINIMUM_AGE}.
        </div>
      ) : null}
      {entered && adult && age !== null ? (
        <div className="mt-3.5 flex items-center gap-3 rounded-[17px] border border-line bg-paper p-3.5">
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-action font-extrabold font-head text-[0.9375rem] text-white">
            {age}
          </span>
          {/* The date read back in words, so it is checked at a glance rather
              than box by box. */}
          <span className="text-[0.8375rem] text-ink2 leading-[1.45]">
            <b className="text-ink">{dateLabel(data.birthDate, 'day')}</b>. Other members see your
            age, never your birthday.
          </span>
        </div>
      ) : null}
    </>
  );
}

export function InjuryStep({ data, set }: StepProps) {
  const injury = injuryDateOf(data);
  const age = ageFrom(data.birthDate || null);
  const injuredAt =
    injury && data.birthDate
      ? Number(injury.date.slice(0, 4)) - Number(data.birthDate.slice(0, 4))
      : null;
  // A condition starts, or is diagnosed; an injury happens.
  const condition = data.injuryType === 'condition';
  // The birthday as they typed it, for "Since birth".
  const birth = data.birthDate ? birthPartsOf(data) : null;

  // The date first and optional, then the kind. A relative has no date of
  // their own to give.
  return (
    <>
      <Question>Your spinal cord</Question>
      <Sub>An injury or a condition: members find each other by this.</Sub>

      {data.injuryType === 'family' ? null : <InjuryDate data={data} set={set} birth={birth} />}
      {data.injuryType !== 'family' &&
      injury &&
      injuredAt !== null &&
      age !== null &&
      injuredAt >= 0 &&
      injuredAt <= age ? (
        <InjuredAt
          label={dateLabel(injury.date, injury.precision)}
          at={injuredAt}
          condition={condition}
        />
      ) : null}

      <div className="mt-5">
        <SpinalCordFields
          answer={data}
          onChange={(patch) => {
            // A relative gives no date of their own: one typed before goes.
            set(
              patch.injuryType === 'family'
                ? { ...patch, injuryYear: '', injuryMonth: '', injuryDay: '' }
                : patch,
            );
          }}
        />
      </div>
    </>
  );
}

function InjuryDate({
  data,
  set,
  birth,
}: StepProps & { birth: ReturnType<typeof birthPartsOf> | null }) {
  return (
    <>
      <h2
        id="injury-date-heading"
        className="mt-4 mb-1 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        When did your injury or condition begin? (optional)
      </h2>
      <DateFields
        id="injury"
        labelledBy="injury-date-heading"
        hint="For a condition, when it started or was diagnosed. Just the year is fine."
        order={BIRTHDAY_ORDER}
        yearAlone
        parts={injuryPartsOf(data)}
        reading={readDate(injuryPartsOf(data), { needs: 'year' })}
        onChange={(next) => {
          set({ injuryYear: next.year, injuryMonth: next.month, injuryDay: next.day });
        }}
      />
      {birth ? (
        <button
          type="button"
          onClick={() => {
            set({ injuryYear: birth.year, injuryMonth: birth.month, injuryDay: birth.day });
          }}
          className="mt-2 inline-flex min-h-[44px] items-center font-bold text-[0.875rem] text-emphasis underline"
        >
          Since birth
        </button>
      ) : null}
    </>
  );
}

/** The date read back, with the age it happened at. */
function InjuredAt({
  label,
  at,
  condition,
}: {
  label: string | null;
  at: number;
  condition: boolean;
}) {
  return (
    <div className="mt-3.5 rounded-[17px] border border-line bg-paper p-3.5 text-[0.8375rem] text-ink2 leading-[1.45]">
      <b className="text-ink">{label}</b>:{' '}
      {at === 0 ? (
        'since birth'
      ) : condition ? (
        <>
          it started when you were <b className="text-ink">{at}</b>
        </>
      ) : (
        <>
          you were injured at <b className="text-ink">{at}</b>
        </>
      )}
      . We use that to put you next to people {condition ? 'whose lives changed' : 'injured'} around
      the same age, not just at the same level.
    </div>
  );
}

export function CityStep({ data, set }: StepProps) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [zipStatus, setZipStatus] = useState<'idle' | 'looking' | 'missed'>('idle');

  function useMyLocation() {
    setLocationError(null);
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot share a location — choose it below.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void reverseGeocode(position.coords.latitude, position.coords.longitude)
          .then((place) => {
            if (place) set({ city: place.city, state: place.state });
            else setLocationError("Couldn't match that to a city — choose it below.");
          })
          .finally(() => {
            setLocating(false);
          });
      },
      () => {
        setLocationError('Location permission denied — choose it below.');
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  function onZipChange(value: string) {
    const zip = value.replace(/\D/g, '').slice(0, 5);
    set({ zip });
    if (zip.length !== 5) {
      setZipStatus('idle');
      return;
    }
    setZipStatus('looking');
    void geocodeZip(zip).then((place) => {
      if (place) {
        set({ city: place.city, state: place.state });
        setZipStatus('idle');
      } else {
        setZipStatus('missed');
      }
    });
  }

  return (
    <>
      <Question>Where do you live?</Question>
      {/* The owner, 2026-10-15. */}
      <Sub>We can use your current location to fill in the fields below.</Sub>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-line bg-paper font-bold font-head text-[0.9375rem] text-ink disabled:opacity-50"
      >
        {locating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LocateFixed className="h-4 w-4" />
        )}
        {locating ? 'Finding you…' : 'Use my location'}
      </button>
      {locationError ? (
        <p role="alert" className="mt-2 text-[0.78125rem] text-destructive leading-[1.45]">
          {locationError}
        </p>
      ) : null}

      <p className="mt-4 text-center text-[0.78125rem] text-grey">or choose it yourself</p>

      <label htmlFor="zip" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        ZIP code
      </label>
      <Field
        id="zip"
        inputMode="numeric"
        maxLength={5}
        placeholder="95814"
        value={data.zip}
        onChange={(e) => {
          onZipChange(e.target.value);
        }}
      />
      <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
        {zipStatus === 'looking'
          ? 'Looking that up…'
          : zipStatus === 'missed'
            ? "Couldn't find that ZIP — pick a state and city below."
            : 'Fills in the city and state for you. The ZIP itself is not stored.'}
      </p>

      <label htmlFor="state" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        State
      </label>
      <select
        id="state"
        value={data.state}
        onChange={(e) => {
          set({ state: e.target.value });
        }}
        className="mt-2.5 w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none focus:border-emphasis"
      >
        <option value="">Select a state</option>
        {US_STATES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>

      <label htmlFor="city" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        City or town
      </label>
      <Field
        id="city"
        autoComplete="address-level2"
        placeholder="San Jose"
        maxLength={MEMBER_TEXT_MAX.city}
        value={data.city}
        onChange={(e) => {
          set({ city: e.target.value });
        }}
      />
      <Fine>The city can be left blank. The state is enough.</Fine>
    </>
  );
}

export function PhotoStep({ data, set }: StepProps) {
  return (
    <>
      <Question>Add a photo?</Question>
      <Sub>
        Optional, and never required — but this is a club of about two dozen people near you, and a
        face makes the first meet-up much easier.
      </Sub>

      <label className="mx-auto mt-6 grid h-[150px] w-[150px] cursor-pointer place-items-center overflow-hidden rounded-[44px] border-[2.5px] border-emphasis border-dashed bg-paper">
        {data.photoPreviewUrl ? (
          <img src={data.photoPreviewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-extrabold font-display text-[2.125rem] text-emphasis">+</span>
        )}
        <input
          type="file"
          accept="image/*"
          // The label around it holds only the picture (alt="") or a "+", so
          // without this the control has no name.
          aria-label={data.photoPreviewUrl ? 'Change the photo' : 'Choose a photo'}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            set({
              photoFile: file,
              photoPreviewUrl: file ? URL.createObjectURL(file) : null,
            });
          }}
        />
      </label>
      <Fine>Skip, and your tile is made from your initials.</Fine>
    </>
  );
}
