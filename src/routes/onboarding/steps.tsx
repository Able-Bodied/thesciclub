import { Loader2, LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { BIRTHDAY_ORDER, DateFields, YEAR_FIRST_ORDER } from '@/components/date-fields';
import { type DateParts, readDate } from '@/lib/date-parts';
import { geocodeZip, reverseGeocode } from '@/lib/geocode';
import { ageFrom, dateLabel, isAdult, MINIMUM_AGE } from '@/lib/injury';
import { MEMBER_TEXT_MAX } from '@/lib/member-limits';
import { formatPhoneInput, isCompletePhone } from '@/lib/phone';
import { usePhotoUrl } from '@/lib/photos';
import { Chip, Field, Fine, Question, Sub, useAutoFocus } from '@/routes/onboarding/chrome';
import type { ClaimableProfile, OnboardingData } from '@/routes/onboarding/types';
import { birthPartsOf, injuryDateOf, injuryPartsOf } from '@/routes/onboarding/types';
import { COMPLETENESS, EXACT_LEVELS, rangeForExact, US_STATES } from '@/types/domain';

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

export function PhoneStep({
  data,
  set,
  mode,
  onComplete,
}: StepProps & {
  mode: 'join' | 'signin';
  /**
   * Called with the number when it becomes complete, typed or autofilled.
   * Passed on the sign-in door only (the owner, 2026-10-06): a returning
   * member has agreed by the line under the field, which is on screen before
   * they type. The join door waits for its two boxes and a press of Text me my code,
   * as registered with the carriers.
   */
  onComplete?: ((phone: string) => void) | undefined;
}) {
  const phoneRef = useAutoFocus();
  return (
    <>
      <Question>{mode === 'signin' ? 'Welcome back' : "What's your number?"}</Question>
      <Sub>
        {mode === 'signin'
          ? 'Your number is your account. We will text you a code to sign you back in.'
          : 'Your number is your account, and it is how the club checks you against the list of people a member organization or a mentor has vouched for. It is never shown to another member.'}
      </Sub>
      <label htmlFor="phone" className="mt-5 block font-bold text-[0.8125rem] text-ink">
        Phone number
      </label>
      <div className="flex items-stretch gap-2.5">
        {/* A fixed +1 rather than a country picker: the club is US-only today,
            and a picker would imply otherwise. */}
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
            const phone = formatPhoneInput(e.target.value);
            set({ phone });
            // Only as the number becomes complete, not on every change to a
            // complete one: correcting a digit in the middle should not send
            // a code before the correction is finished.
            if (onComplete && isCompletePhone(phone) && !isCompletePhone(data.phone)) {
              onComplete(phone);
            }
          }}
        />
      </div>
      {mode === 'signin' ? (
        /* One line instead of two boxes on the sign-in door, at the owner's
           word (2026-10-01): a returning member asking for a code to their
           own account agrees by continuing. The join door keeps the boxes. */
        <p className="mt-3 text-[0.84375rem] text-ink2 leading-[1.5]">
          {SIGN_IN_CONSENT} <NewTabLink href="/terms">Terms of Service</NewTabLink> and{' '}
          <NewTabLink href="/privacy">Privacy Policy</NewTabLink>.
        </p>
      ) : (
        <JoinConsent data={data} set={set} />
      )}
    </>
  );
}

/**
 * The two boxes again, for somebody who came through the sign-in door with a
 * number that is not a member yet.
 *
 * The sign-in line agrees to the code text, and that text has been sent. But
 * this is joining, and joining asks for both ticks (the Terms say so), so the
 * questions wait for them. Until 2026-10-01 they did not: a new member could
 * tap "I already have an account" and be handed the questions with neither box
 * ever shown (the owner found it).
 */
export function AgreeStep({ data, set }: StepProps) {
  return (
    <>
      <Question>Before you join</Question>
      <Sub>
        This number is not a member yet, so this is joining rather than signing in. Joining asks for
        both of these.
      </Sub>
      <JoinConsent data={data} set={set} before="you go on" />
    </>
  );
}

/** The join door's two boxes, and why the button waits for them. */
function JoinConsent({ data, set, before = 'the code is sent' }: StepProps & { before?: string }) {
  return (
    <>
      <ConsentBox
        id="sms-consent"
        checked={data.smsConsent}
        onChange={(smsConsent) => {
          set({ smsConsent });
        }}
      >
        {SMS_CONSENT}
      </ConsentBox>
      <ConsentBox
        id="terms-agreed"
        checked={data.termsAgreed}
        onChange={(termsAgreed) => {
          set({ termsAgreed });
        }}
      >
        I agree to the <NewTabLink href="/terms">Terms of Service</NewTabLink> and{' '}
        <NewTabLink href="/privacy">Privacy Policy</NewTabLink>.
      </ConsentBox>
      {/* Said, not just shown by a dimmed button, the way the birthday step
          says why an under-18 date goes no further. Only once the number is
          in, so it is not the first thing read on an empty screen. */}
      {isCompletePhone(data.phone) && !(data.smsConsent && data.termsAgreed) ? (
        <Fine>
          Both boxes need a tick before {before}: the club signs you in by text, and using it means
          agreeing to its terms.
        </Fine>
      ) : null}
    </>
  );
}

/**
 * The words of the first box, exactly as the club's text-message
 * registration with the carriers quotes them (2026-10-01). Change one and
 * the registration has to change with it.
 */
export const SMS_CONSENT =
  'Text me a one-time sign-in code from The SCI Club. One text each time I ask for a code. Message and data rates may apply. Reply HELP for help, STOP to opt out.';

/** The sign-in door's line, before its two links. Registered as well. */
/** The phone step's button, on both doors: it says what pressing it does. */
export const PHONE_BUTTON = 'Text me my code';

/**
 * "By entering your number", not by pressing anything: the sign-in door sends
 * the code on the tenth digit, before any button (see `onComplete` above), and
 * this line is on screen before the first digit is typed (2026-10-08).
 */
export const SIGN_IN_CONSENT =
  'By entering your number, you agree to get a one-time sign-in code by text from The SCI Club (Msg & data rates may apply; reply HELP for help, STOP to opt out) and to the';

/**
 * One of the two boxes on the phone step.
 *
 * A real checkbox, unticked to begin with: carriers reject a box that starts
 * ticked, and agreement to the texts has to be a box of its own, apart from the
 * terms. The whole row is the label, so the target is the sentence and not
 * only the square, and the square is sized in em so it grows with the text.
 */
function ConsentBox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[0.84375rem] text-ink2 leading-[1.5]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="mt-[0.1em] h-[1.375em] w-[1.375em] flex-none accent-emphasis"
      />
      <span>{children}</span>
    </label>
  );
}

/**
 * A link out of the phone step that leaves it where it was. In the same tab,
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

/**
 * `onComplete` runs when the sixth digit goes in, typed or filled in by the
 * phone from the text message, so nobody has to find Continue as well.
 */
export function CodeStep({
  data,
  set,
  onComplete,
}: StepProps & { onComplete: (code: string) => void }) {
  const codeRef = useAutoFocus();
  return (
    <>
      <Question>Enter your code</Question>
      <Sub>We sent six digits to {data.phone || 'your phone'}.</Sub>
      <Field
        ref={codeRef}
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        className="text-center font-extrabold text-[1.5rem] tracking-[.42em]"
        value={data.code}
        onChange={(e) => {
          const code = e.target.value.replace(/\D/g, '').slice(0, 6);
          set({ code });
          if (code.length === 6 && code !== data.code) onComplete(code);
        }}
      />
    </>
  );
}

export function NameStep({ data, set }: StepProps) {
  const nameRef = useAutoFocus();
  return (
    <>
      <Question>What should people call you?</Question>
      <Sub>First name is plenty.</Sub>
      <Field
        ref={nameRef}
        id="name"
        autoComplete="given-name"
        placeholder="Alex"
        maxLength={MEMBER_TEXT_MAX.display_name}
        value={data.displayName}
        onChange={(e) => {
          set({ displayName: e.target.value });
        }}
      />
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
  const injuryYearRef = useAutoFocus();
  const injury = injuryDateOf(data);
  const age = ageFrom(data.birthDate || null);
  const injuredAt =
    injury && data.birthDate
      ? Number(injury.date.slice(0, 4)) - Number(data.birthDate.slice(0, 4))
      : null;

  return (
    <>
      <Question>Tell us about your injury</Question>
      <Sub>The things members filter on most.</Sub>

      <label
        htmlFor="level"
        className="mt-5 mb-2 block font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Level of injury
      </label>
      <select
        id="level"
        value={data.exactLevel ?? ''}
        onChange={(e) => {
          set({ exactLevel: (e.target.value || null) as OnboardingData['exactLevel'] });
        }}
        className="w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none focus:border-emphasis"
      >
        <option value="">Select a level</option>
        {EXACT_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      {data.exactLevel && data.exactLevel !== 'Do not know' ? (
        <p className="mt-2 text-[0.78125rem] text-grey leading-[1.5]">
          Members browsing by level will find you under {rangeForExact(data.exactLevel)}.
        </p>
      ) : null}

      <h2 className="mt-5 mb-2 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        Complete or incomplete?
      </h2>
      <div className="flex flex-wrap gap-2">
        {COMPLETENESS.map((value) => (
          <Chip
            key={value}
            selected={data.completeness === value}
            onClick={() => {
              set({ completeness: value });
            }}
          >
            {value}
          </Chip>
        ))}
      </div>

      <h2
        id="injury-date-heading"
        className="mt-5 mb-1 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        When were you injured?
      </h2>
      <DateFields
        id="injury"
        labelledBy="injury-date-heading"
        hint="The year on its own is a complete answer. Add more only if you want to."
        order={YEAR_FIRST_ORDER}
        parts={injuryPartsOf(data)}
        reading={readDate(injuryPartsOf(data), { needs: 'year' })}
        onChange={(next) => {
          set({ injuryYear: next.year, injuryMonth: next.month, injuryDay: next.day });
        }}
        firstRef={injuryYearRef}
      />

      {injury && injuredAt !== null && age !== null && injuredAt >= 0 && injuredAt <= age ? (
        <div className="mt-3.5 rounded-[17px] border border-line bg-paper p-3.5 text-[0.8375rem] text-ink2 leading-[1.45]">
          <b className="text-ink">{dateLabel(injury.date, injury.precision)}</b>: you were injured
          at <b className="text-ink">{injuredAt}</b>. We use that to put you next to people injured
          around the same age, not just at the same level.
        </div>
      ) : null}
    </>
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
      <Sub>We show peers and events near you first. City and state only — never your address.</Sub>

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

export function ClaimStep({
  profile,
  onAccept,
  onDecline,
}: {
  /** Ten fields, not a profile — see ClaimableProfile for why. */
  profile: ClaimableProfile;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const photo = usePhotoUrl(profile.photoPath);
  return (
    <>
      <Question>Is this you?</Question>
      <Sub>
        {profile.affiliations[0] ?? 'A member organization'} already has a profile for this number.
        You can carry it across, or start from scratch — either way it stops being separate from
        you.
      </Sub>
      <div className="mt-4 flex items-center gap-3.5 rounded-[17px] border border-line bg-paper p-3.5">
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-[62px] w-[62px] flex-none rounded-[18px] object-cover"
          />
        ) : null}
        <span>
          <span className="block font-extrabold font-head text-[1.03125rem]">
            {profile.displayName}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] text-ink2">
            {[profile.exactLevel ?? profile.levelRange, profile.city].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-action font-bold font-head text-[0.9375rem] text-white"
        >
          Yes, that's me
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis"
        >
          Start fresh
        </button>
      </div>
      <Fine>
        Starting fresh removes the old profile too. Either way there is only ever one of you in the
        club.
      </Fine>
    </>
  );
}
