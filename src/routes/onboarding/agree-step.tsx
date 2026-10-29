import { Handshake, Stethoscope, Users } from 'lucide-react';
import { Fine, Question, Sub } from '@/routes/onboarding/chrome';
import { NewTabLink } from '@/routes/onboarding/steps';

/**
 * "Before you join" (the owner, 2026-10-29): the first screen after the
 * account is made, before any question. Short on purpose: three things worth
 * knowing, and the terms agreed by tapping Continue (no box to tick, the
 * owner's word). page.tsx records it (src/lib/terms.ts).
 *
 * The Terms say each of these at more length: "Not medical advice", "Events
 * and other sites", and "Adults only".
 */
export function AgreeStep() {
  return (
    <>
      <Question>Before you join</Question>
      <Sub>The SCI Club is a place to share what life with spinal cord injury has taught us.</Sub>
      <Point icon={<Users className="h-[18px] w-[18px]" />} title="Experience, not medical advice">
        What members share is their own experience and opinion. It is not medical advice.
      </Point>
      <Point icon={<Stethoscope className="h-[18px] w-[18px]" />} title="Talk to your doctor first">
        Check with your doctor before changing any treatment, medication, or care routine.
      </Point>
      <Point
        icon={<Handshake className="h-[18px] w-[18px]" />}
        title="Meeting in person is your choice"
      >
        Meeting people from the club, at an event or one to one, is up to you and at your own risk.
      </Point>
      <Fine>
        By tapping Continue, you confirm you are 18 or older and agree to our{' '}
        <NewTabLink href="/terms">Terms of Service</NewTabLink> and{' '}
        <NewTabLink href="/privacy">Privacy Policy</NewTabLink>.
      </Fine>
      <Fine>In an emergency, call 911.</Fine>
    </>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex gap-3 rounded-[14px] border border-line bg-paper p-4">
      <div
        aria-hidden="true"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-lt text-gold-dp"
      >
        {icon}
      </div>
      <div>
        <h2 className="font-extrabold font-head text-[0.9375rem] text-ink">{title}</h2>
        <p className="mt-1 text-[0.875rem] text-ink2 leading-[1.5]">{children}</p>
      </div>
    </div>
  );
}
