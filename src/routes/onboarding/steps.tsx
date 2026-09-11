import { ageFrom } from '@/lib/injury';
import { photoUrlFor } from '@/lib/photos';
import { Chip, Field, Fine, Question, Sub } from '@/routes/onboarding/chrome';
import type { OnboardingData } from '@/routes/onboarding/types';
import { injuryDateOf } from '@/routes/onboarding/types';
import type { BrowseMember } from '@/types/domain';
import { COMPLETENESS, LEVEL_RANGES } from '@/types/domain';

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
      <Field
        id="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(408) 555-0112"
        value={data.phone}
        onChange={(e) => {
          set({ phone: e.target.value });
        }}
      />
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

      <h2 className="mt-5 mb-2 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
        Level of injury
      </h2>
      <div className="flex flex-wrap gap-2">
        {LEVEL_RANGES.map((level) => (
          <Chip
            key={level}
            selected={data.levelRange === level}
            onClick={() => {
              set({ levelRange: level });
            }}
          >
            {level}
          </Chip>
        ))}
      </div>

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

const CITIES = [
  'San Jose',
  'San Francisco',
  'Santa Clara',
  'Oakland',
  'Fremont',
  'Santa Cruz',
  'Sacramento',
];

export function CityStep({ data, set }: StepProps) {
  return (
    <>
      <Question>Where do you live?</Question>
      <Sub>
        Because the point is meeting in person, the club sorts by how close things are to you.
      </Sub>
      <div className="mt-4 flex flex-wrap gap-2">
        {CITIES.map((city) => (
          <Chip
            key={city}
            selected={data.city === city}
            onClick={() => {
              set({ city, state: 'CA' });
            }}
          >
            {city}
          </Chip>
        ))}
        <Chip
          selected={data.city === ''}
          onClick={() => {
            set({ city: '' });
          }}
        >
          Somewhere else
        </Chip>
      </div>
      <Fine>A city, never a location. The club never stores where you are right now.</Fine>
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
