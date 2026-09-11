import { Loader2, LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { geocodeZip, reverseGeocode } from '@/lib/geocode';
import { ageFrom } from '@/lib/injury';
import { formatPhoneInput } from '@/lib/phone';
import { photoUrlFor } from '@/lib/photos';
import { Chip, Field, Fine, Question, Sub } from '@/routes/onboarding/chrome';
import type { OnboardingData } from '@/routes/onboarding/types';
import { injuryDateOf } from '@/routes/onboarding/types';
import type { BrowseMember } from '@/types/domain';
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

export function PhoneStep({ data, set }: StepProps) {
  return (
    <>
      <Question>What's your number?</Question>
      <Sub>
        Your number is your account, and it is how the club checks you against the list of people a
        member organization or a mentor has vouched for. It is never shown to another member.
      </Sub>
      <label htmlFor="phone" className="mt-5 block font-bold text-[13px] text-ink">
        Phone number
      </label>
      <div className="flex items-stretch gap-2.5">
        {/* A fixed +1 rather than a country picker: the club is US-only today,
            and a picker would imply otherwise. */}
        <span className="mt-2.5 grid flex-none place-items-center rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 font-semibold text-[16px] text-ink2">
          +1
        </span>
        <Field
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
      <Fine>We text you a one-time code to verify it. Message and data rates may apply.</Fine>
    </>
  );
}

export function CodeStep({ data, set }: StepProps) {
  return (
    <>
      <Question>Enter your code</Question>
      <Sub>We sent six digits to {data.phone || 'your phone'}.</Sub>
      <Field
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        className="text-center font-extrabold text-[24px] tracking-[.42em]"
        value={data.code}
        onChange={(e) => {
          set({ code: e.target.value.replace(/\D/g, '') });
        }}
      />
    </>
  );
}

export function NameStep({ data, set }: StepProps) {
  return (
    <>
      <Question>What should people call you?</Question>
      <Sub>First name is plenty.</Sub>
      <Field
        id="name"
        autoComplete="given-name"
        placeholder="Alex"
        value={data.displayName}
        onChange={(e) => {
          set({ displayName: e.target.value });
        }}
      />
    </>
  );
}

export function BirthdayStep({ data, set }: StepProps) {
  const age = ageFrom(data.birthDate || null);
  return (
    <>
      <Question>When is your birthday?</Question>
      <Sub>
        Age matters for matching — a 28-year-old and a 68-year-old with the same injury are living
        different days.
      </Sub>
      <Field
        id="birthday"
        type="date"
        max="2008-12-31"
        value={data.birthDate}
        onChange={(e) => {
          set({ birthDate: e.target.value });
        }}
      />
      {age !== null ? (
        <div className="mt-3.5 flex items-center gap-3 rounded-[17px] border border-line bg-paper p-3.5">
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-navy font-extrabold font-head text-[15px] text-white">
            {age}
          </span>
          <span className="text-[13.4px] text-ink2 leading-[1.45]">
            Other members see your age, never your birthday.
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

  return (
    <>
      <Question>Tell us about your injury</Question>
      <Sub>The things members filter on most.</Sub>

      <label
        htmlFor="level"
        className="mt-5 mb-2 block font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]"
      >
        Level of injury
      </label>
      <select
        id="level"
        value={data.exactLevel ?? ''}
        onChange={(e) => {
          set({ exactLevel: (e.target.value || null) as OnboardingData['exactLevel'] });
        }}
        className="w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-navy"
      >
        <option value="">Select a level</option>
        {EXACT_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      {data.exactLevel && data.exactLevel !== 'Do not know' ? (
        <p className="mt-2 text-[12.5px] text-grey leading-[1.5]">
          Members browsing by level will find you under {rangeForExact(data.exactLevel)}.
        </p>
      ) : null}

      <h2 className="mt-5 mb-2 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
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

      <h2 className="mt-5 mb-1 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
        When were you injured?
      </h2>
      <p className="text-[12.5px] text-grey leading-[1.5]">
        The year on its own is a complete answer. Add more only if you want to.
      </p>
      <div className="mt-2.5 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="injury-year" className="text-[12px] text-grey">
            Year
          </label>
          <Field
            id="injury-year"
            inputMode="numeric"
            maxLength={4}
            placeholder="2013"
            value={data.injuryYear}
            onChange={(e) => {
              set({ injuryYear: e.target.value.replace(/\D/g, '') });
            }}
          />
        </div>
        <div className="w-[88px]">
          <label htmlFor="injury-month" className="text-[12px] text-grey">
            Month
          </label>
          <Field
            id="injury-month"
            inputMode="numeric"
            maxLength={2}
            placeholder="—"
            value={data.injuryMonth}
            onChange={(e) => {
              set({ injuryMonth: e.target.value.replace(/\D/g, '') });
            }}
          />
        </div>
        <div className="w-[88px]">
          <label htmlFor="injury-day" className="text-[12px] text-grey">
            Day
          </label>
          <Field
            id="injury-day"
            inputMode="numeric"
            maxLength={2}
            placeholder="—"
            value={data.injuryDay}
            onChange={(e) => {
              set({ injuryDay: e.target.value.replace(/\D/g, '') });
            }}
          />
        </div>
      </div>

      {injuredAt !== null && age !== null && injuredAt >= 0 && injuredAt <= age ? (
        <div className="mt-3.5 rounded-[17px] border border-line bg-paper p-3.5 text-[13.4px] text-ink2 leading-[1.45]">
          You were injured at <b className="text-ink">{injuredAt}</b>. We use that to put you next
          to people injured around the same age, not just at the same level.
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
        className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-line bg-paper font-bold font-head text-[15px] text-ink disabled:opacity-50"
      >
        {locating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LocateFixed className="h-4 w-4" />
        )}
        {locating ? 'Finding you…' : 'Use my location'}
      </button>
      {locationError ? (
        <p className="mt-2 text-[12.5px] text-destructive leading-[1.45]">{locationError}</p>
      ) : null}

      <p className="mt-4 text-center text-[12.5px] text-grey">or choose it yourself</p>

      <label htmlFor="zip" className="mt-4 block font-bold text-[13px] text-ink">
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
      <p className="mt-1.5 text-[12px] text-grey leading-[1.45]">
        {zipStatus === 'looking'
          ? 'Looking that up…'
          : zipStatus === 'missed'
            ? "Couldn't find that ZIP — pick a state and city below."
            : 'Fills in the city and state for you. The ZIP itself is not stored.'}
      </p>

      <label htmlFor="state" className="mt-4 block font-bold text-[13px] text-ink">
        State
      </label>
      <select
        id="state"
        value={data.state}
        onChange={(e) => {
          set({ state: e.target.value });
        }}
        className="mt-2.5 w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-navy"
      >
        <option value="">Select a state</option>
        {US_STATES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>

      <label htmlFor="city" className="mt-4 block font-bold text-[13px] text-ink">
        City or town
      </label>
      <Field
        id="city"
        autoComplete="address-level2"
        placeholder="San Jose"
        value={data.city}
        onChange={(e) => {
          set({ city: e.target.value });
        }}
      />
      <Fine>Leave the city blank if you would rather not say. The state is enough.</Fine>
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

      <label className="mx-auto mt-6 grid h-[150px] w-[150px] cursor-pointer place-items-center overflow-hidden rounded-[44px] border-[2.5px] border-navy border-dashed bg-paper">
        {data.photoPreviewUrl ? (
          <img src={data.photoPreviewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-extrabold font-head text-[34px] text-navy">+</span>
        )}
        <input
          type="file"
          accept="image/*"
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
  profile: BrowseMember;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const photo = photoUrlFor(profile.photoPath);
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
          <span className="block font-extrabold font-head text-[16.5px]">
            {profile.displayName}
          </span>
          <span className="mt-0.5 block text-[13px] text-ink2">
            {[profile.exactLevel ?? profile.levelRange, profile.city].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-navy font-bold font-head text-[15px] text-white"
        >
          Yes, that's me
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy font-bold font-head text-[15px] text-navy"
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
