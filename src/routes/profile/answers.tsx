import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AccountProblem } from '@/components/account-problem';
import { AppNav } from '@/components/app-nav';
import { useAccount } from '@/lib/account';
import { dateLabel, injuryDateLabel } from '@/lib/injury';
import { signInDoor } from '@/lib/sign-in-destination';
import { loadDetails, type MemberDetails } from '@/routes/profile/details-api';
import { loadAnswers } from '@/routes/profile/profile-api';
import {
  DETAIL_PARTS,
  type DetailPart,
  nextStep,
  PART_TITLES,
  partOpen,
  profilePercent,
  type Step,
  stepHref,
} from '@/routes/profile/progress';
import { type Answers, answerInWords, questionsOn, SCREENS } from '@/routes/profile/questions';
import { cityAndState, hasNoInjury, injuryLabel } from '@/types/domain';

/**
 * Your profile, as one thing (the owner, 2026-11-12): the details onboarding
 * asked and the survey's questions in one list, one percentage, and one "Next"
 * that picks up where the member left off. It had been two pages pushed into
 * one: a details card with its own Change, then a card per survey screen.
 *
 * Next walks every open step, details first, one at a time (/profile/next);
 * Change on a row opens just that one and comes back here.
 */
export default function ProfileAnswersPage() {
  const account = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Answers>({});
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account.status !== 'member') return;
    void Promise.all([loadDetails({ fresh: true }), loadAnswers({ fresh: true })]).then(
      ([d, a]) => {
        if (d.ok) setDetails(d.details);
        else setError(d.error);
        if (a.ok) {
          setAnswers(a.answers);
          setDeclined(a.declined);
        } else setError(a.error);
        setLoading(false);
      },
    );
  }, [account.status]);

  if (account.status === 'error') return <AccountProblem account={account} />;
  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member')
    return (
      <Navigate to={signInDoor(`${location.pathname}${location.search}${location.hash}`)} replace />
    );

  const next = details ? nextStep(details, answers, declined) : null;
  const percent = details ? profilePercent(details, answers, declined) : null;
  // The screens with something to ask this member, as rows.
  const screens = SCREENS.flatMap((screen, index) => {
    const questions = questionsOn(screen, answers);
    if (questions.length === 0) return [];
    const lines = questions.map((q) => ({
      label: questions.length > 1 ? q.title : null,
      value: answerInWords(q, answers, declined),
    }));
    return [{ title: screen.title, index, lines, open: lines.some((l) => OPEN.has(l.value)) }];
  });

  // The tab bar, so this is not a dead end on a phone (the owner, 2026-11-01).
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <AppNav />
      <main className="mx-auto flex min-h-0 w-full max-w-[520px] flex-1 flex-col">
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
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h1 className="font-extrabold font-display text-[1.4375rem] text-ink tracking-[-0.01em]">
              Your profile
            </h1>
            {percent !== null ? (
              <span className="flex-none font-bold text-[0.875rem] text-emphasis">
                {percent === 100 ? 'Complete' : `${percent}% done`}
              </span>
            ) : null}
          </div>
          {percent !== null ? (
            <div
              role="progressbar"
              aria-label="Your profile"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-line"
            >
              <div className="h-full rounded-full bg-emphasis" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <p className="mt-2 text-[0.8125rem] text-ink2 leading-[1.5]">
            What other members can find you by. Change any of it whenever you like.
          </p>
          {/* The recommended step, before the list it is in (the owner, 2026-11-15). */}
          {next ? (
            <Link
              to="/profile/next"
              className="mt-2 inline-flex items-center gap-0.5 font-semibold text-[0.8125rem] text-emphasis underline decoration-line underline-offset-2 hover:decoration-emphasis"
            >
              Next: {stepAction(next)}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </header>

        {/* Keep the absolutely positioned screen-reader labels inside this
            scroller, so they cannot create a second scrollbar on the page. */}
        <div className="relative flex-1 overflow-y-auto px-[18px] py-4">
          {loading ? (
            <p role="status" className="py-10 text-center text-[0.875rem] text-grey">
              Loading…
            </p>
          ) : error || !details ? (
            <p role="alert" className="py-10 text-center text-[0.875rem] text-ink2">
              {error ?? 'Could not load your profile.'}
            </p>
          ) : (
            // One list, details then questions (the owner, 2026-11-15).
            <section
              aria-label="Everything on your profile"
              className="rounded-[17px] border border-line bg-paper px-3.5"
            >
              {DETAIL_PARTS.map((part) => {
                const step: Step = { kind: 'details', part };
                return (
                  <Row
                    key={part}
                    title={PART_TITLES[part]}
                    lines={detailLines(details, part)}
                    open={partOpen(details, part)}
                    next={next?.kind === 'details' && next.part === part ? next : null}
                    href={stepHref(step, false)}
                    verb="Add"
                  />
                );
              })}
              {screens.map((row) => (
                <Row
                  key={row.title}
                  title={row.title}
                  lines={row.lines}
                  open={row.open}
                  next={next?.kind === 'survey' && next.screen === row.index ? next : null}
                  href={stepHref({ kind: 'survey', screen: row.index }, false)}
                  verb="Answer"
                />
              ))}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

const ACTIONS: Record<DetailPart, string> = {
  photo: 'Add a profile photo',
  name: 'Add your name',
  birthday: 'Add your birthday',
  injury: 'Add your injury or condition',
  place: 'Add where you live',
};

/** The recommended step, said as a thing to do. */
function stepAction(step: Step): string {
  return step.kind === 'details'
    ? ACTIONS[step.part]
    : `Answer “${SCREENS[step.screen]?.title ?? ''}”`;
}

const NOT_YET = 'Not added yet';
/** Nothing said yet: shown as a link to say it. */
const OPEN = new Set([NOT_YET, 'Not answered yet']);
const QUIET = new Set([...OPEN, 'Rather not say']);

/** A part of the details, in the same shape as a screen's answers. */
function detailLines(
  details: MemberDetails,
  part: DetailPart,
): { label: string | null; value: string }[] {
  const declined = new Set(details.declined);
  const say = (key: string, value: string | null) =>
    value ?? (declined.has(key) ? 'Rather not say' : NOT_YET);
  switch (part) {
    case 'photo':
      return [{ label: null, value: details.photoPath ? 'Added' : say('photo', null) }];
    case 'name':
      return [{ label: null, value: details.displayName.trim() || NOT_YET }];
    case 'birthday':
      return [
        {
          label: null,
          value: details.birthDate ? (dateLabel(details.birthDate, 'day') ?? NOT_YET) : NOT_YET,
        },
      ];
    case 'injury':
      return [
        {
          label: 'Injury or condition',
          value: say(
            'exactLevel',
            details.injuryType || details.exactLevel
              ? injuryLabel({ ...details, levelRange: null })
              : null,
          ),
        },
        // Not asked of somebody without an injury, so not listed either.
        ...(hasNoInjury(details.injuryType)
          ? []
          : [{ label: 'Date', value: say('injuryDate', injuryDateLabel(details)) }]),
      ];
    case 'place':
      return [
        { label: null, value: say('city', cityAndState(details) ?? (details.state || null)) },
      ];
  }
}

function Row({
  title,
  lines,
  open,
  next,
  href,
  verb,
}: {
  title: string;
  lines: { label: string | null; value: string }[];
  open: boolean;
  /** The recommended step, when it is this row. */
  next: Step | null;
  href: string;
  verb: 'Add' | 'Answer';
}) {
  const id = `profile-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="border-line border-b py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-extrabold font-head text-[0.9375rem] text-ink">
          {title}
        </h2>
        {/* Open rows are added to from their empty answers instead. */}
        {open ? null : (
          <Link
            to={href}
            // The word on screen first, then which one.
            aria-label={`Change ${title}`}
            data-target="small"
            className="flex-none font-semibold text-[0.8125rem] text-emphasis underline decoration-line underline-offset-2 hover:decoration-emphasis"
          >
            Change
          </Link>
        )}
      </div>
      <dl className="mt-1">
        {lines.map((line) => (
          <div key={`${line.label}-${line.value}`} className="mt-1">
            {line.label ? (
              <dt className="font-semibold text-[0.78125rem] text-grey">{line.label}</dt>
            ) : (
              <dt className="sr-only">{title}</dt>
            )}
            <dd
              className={
                QUIET.has(line.value)
                  ? 'text-[0.875rem] text-grey italic'
                  : 'line-clamp-3 text-[0.875rem] text-ink leading-[1.5]'
              }
            >
              {OPEN.has(line.value) && !next ? (
                <Link
                  to={href}
                  aria-label={`${verb} now: ${line.label ?? title}`}
                  className="font-semibold text-emphasis not-italic underline decoration-line underline-offset-2 hover:decoration-emphasis"
                >
                  {verb} now
                </Link>
              ) : (
                line.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {next ? (
        <div className="mt-2.5 rounded-[13px] border-2 border-emphasis bg-tint p-3">
          <p className="font-extrabold font-head text-[0.9375rem] text-ink">
            Recommended next: {stepAction(next)}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.5]">
            Then carry on through the rest. Skip any, stop at any time.
          </p>
          <Link
            to={stepHref(next, true)}
            className="mt-2.5 flex min-h-[44px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi"
          >
            {verb} now
          </Link>
        </div>
      ) : null}
    </section>
  );
}
