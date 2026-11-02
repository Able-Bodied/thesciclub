import { ImagePlus, ListChecks, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasPhoto, loadAnswers } from '@/routes/profile/profile-api';
import {
  type Answers,
  firstOpenScreen,
  isAnswered,
  questionFor,
  SCREENS,
} from '@/routes/profile/questions';

/**
 * A card in Home's feed asking for one thing the member's profile still lacks
 * (the owner, 2026-11-01): a picture, then interests, then whatever else is
 * open. The first two wait until answered, declined or put off. The rest are
 * asked more sparingly, seen once a week, since a nudge on every visit about
 * the fourteenth question is how a card stops being read.
 */
export type ProfileAsk =
  | { kind: 'photo' }
  | { kind: 'interests'; screen: number }
  | { kind: 'rest'; screen: number; title: string };

const SURVEY_INTERESTS = SCREENS.findIndex((screen) => screen.keys.includes('interests'));

export function nextProfileAsk(
  answers: Answers,
  declined: ReadonlySet<string>,
  photo: boolean,
): ProfileAsk | null {
  if (!photo && !declined.has('photo')) return { kind: 'photo' };
  const interests = questionFor('interests');
  if (interests && !isAnswered(interests, answers, declined)) {
    return { kind: 'interests', screen: SURVEY_INTERESTS };
  }
  const screen = firstOpenScreen(answers, declined);
  if (screen === null) return null;
  return { kind: 'rest', screen, title: SCREENS[screen]?.title ?? '' };
}

const HIDDEN_KEY = 'sciclub.profileCardHiddenUntil';
const WEEK = 7 * 86_400_000;
const MONTH = 30 * 86_400_000;

function hiddenNow(): boolean {
  try {
    const until = Number(window.localStorage.getItem(HIDDEN_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function hideFor(span: number): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, String(Date.now() + span));
  } catch {
    // Shown again next time, which is the harmless way to fail.
  }
}

/** What to ask, read once here so a change of pill neither reads nor counts it again. */
export function useProfileAsk(memberId: string | null) {
  const [ask, setAsk] = useState<ProfileAsk | null>(null);
  useEffect(() => {
    if (!memberId || hiddenNow()) return;
    let cancelled = false;
    void Promise.all([loadAnswers(), hasPhoto()])
      .then(([read, photo]) => {
        if (cancelled || !read.ok) return;
        const next = nextProfileAsk(read.answers, read.declined, photo);
        // Seeing it is what uses up the week, whether or not it is answered.
        if (next?.kind === 'rest') hideFor(WEEK);
        setAsk(next);
      })
      // No card, which is all a profile that cannot be read should cost Home.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [memberId]);
  const notNow = () => {
    hideFor(ask?.kind === 'rest' ? MONTH : WEEK);
    setAsk(null);
  };
  return { ask, notNow };
}

const WORDS = {
  photo: {
    Icon: ImagePlus,
    title: 'Add a picture',
    body: 'A face makes it easier for peers to say hello.',
    action: 'Add a picture',
  },
  interests: {
    Icon: Sparkles,
    title: 'What are you into?',
    body: 'Pick your interests, so we can point you to peers and organizations you’ll like.',
    action: 'Choose interests',
  },
  rest: {
    Icon: ListChecks,
    title: 'A little more about you',
    body: '',
    action: 'Answer',
  },
};

export function ProfileCard({
  ask,
  onNotNow,
  className,
}: {
  ask: ProfileAsk;
  onNotNow: () => void;
  className?: string;
}) {
  const { Icon, title, body, action } = WORDS[ask.kind];
  return (
    <li className={className}>
      <section
        aria-labelledby="home-profile-title"
        className="rounded-[17px] border border-line bg-tint p-3.5"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 flex-none place-items-center rounded-full bg-paper text-emphasis"
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <h2
              id="home-profile-title"
              className="font-extrabold font-head text-[1rem] text-ink leading-[1.3]"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-[0.84375rem] text-ink2 leading-[1.45]">
              {ask.kind === 'rest' ? `Next on your profile: ${ask.title}.` : body}
            </p>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={ask.kind === 'photo' ? '/profile/details' : `/profile?screen=${ask.screen}`}
            state={{ oneScreen: true }}
            className="flex min-h-11 items-center justify-center rounded-[13px] bg-action px-4 font-bold font-head text-[0.875rem] text-white hover:bg-action-hi"
          >
            {action}
          </Link>
          <button
            type="button"
            onClick={onNotNow}
            className="flex min-h-11 items-center justify-center rounded-[13px] px-3 font-bold font-head text-[0.875rem] text-emphasis hover:bg-paper"
          >
            Not now
          </button>
        </div>
      </section>
    </li>
  );
}
