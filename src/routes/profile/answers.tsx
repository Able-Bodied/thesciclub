import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { loadAnswers } from '@/routes/profile/profile-api';
import {
  type Answers,
  answerInWords,
  firstOpenScreen,
  questionsOn,
  SCREENS,
} from '@/routes/profile/questions';

/**
 * Everything the survey has been told, on one page.
 *
 * The survey is twelve screens in a row, which suits answering it and does not
 * suit changing one answer months later: that meant walking to it, and there
 * was nowhere to see what had been said at all — Me showed a percentage. Here
 * each screen is a section with its answers under it, and "Change" opens the
 * survey on that screen alone; its way out then comes back here rather than
 * to Me (`?screen=` in page.tsx).
 *
 * Reached from Me's profile card once anything is answered. A member who has
 * answered nothing is sent straight into the survey instead, because a page
 * of twelve "Not answered yet"s is a list of chores, not an overview.
 */
export default function ProfileAnswersPage() {
  const account = useAccount();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Answers>({});
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account.status !== 'member') return;
    void loadAnswers().then((result) => {
      if (result.ok) {
        setAnswers(result.answers);
        setDeclined(result.declined);
      } else setError(result.error);
      setLoading(false);
    });
  }, [account.status]);

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;

  const open = loading ? null : firstOpenScreen(answers, declined);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-canvas">
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
        <h1 className="mt-1 font-extrabold font-display text-[1.4375rem] text-ink tracking-[-0.01em]">
          Your answers
        </h1>
        <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
          What other members can find you by. Change any of it whenever you like.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-[18px] py-4">
        {loading ? (
          <p role="status" className="py-10 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : error ? (
          <p role="alert" className="py-10 text-center text-[0.875rem] text-ink2">
            {error}
          </p>
        ) : (
          SCREENS.map((screen, index) => {
            const questions = questionsOn(screen, answers);
            if (questions.length === 0) return null;
            return (
              <section
                key={screen.title}
                aria-labelledby={`answers-${index}`}
                className="mb-2.5 rounded-[17px] border border-line bg-paper p-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    id={`answers-${index}`}
                    className="font-extrabold font-head text-[0.96875rem] text-ink"
                  >
                    {screen.title}
                  </h2>
                  <Link
                    to={`/profile?screen=${index}`}
                    // The word on screen first, then which one.
                    aria-label={`Change ${screen.title}`}
                    data-target="small"
                    className="flex-none font-semibold text-[0.8125rem] text-emphasis underline decoration-line underline-offset-2 hover:decoration-emphasis"
                  >
                    Change
                  </Link>
                </div>
                <dl className="mt-1.5">
                  {questions.map((question) => {
                    const said = answerInWords(question, answers, declined);
                    const blank = said === 'Not answered yet' || said === 'Rather not say';
                    return (
                      <div key={question.key} className="mt-1.5">
                        {/* The question is only worth printing when the screen
                            asks more than one; otherwise it is the title. */}
                        {questions.length > 1 ? (
                          <dt className="font-semibold text-[0.78125rem] text-grey">
                            {question.title}
                          </dt>
                        ) : (
                          <dt className="sr-only">{question.title}</dt>
                        )}
                        <dd
                          className={
                            blank
                              ? 'text-[0.875rem] text-grey italic'
                              : 'line-clamp-3 text-[0.875rem] text-ink leading-[1.5]'
                          }
                        >
                          {said}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            );
          })
        )}
      </div>

      {open !== null ? (
        <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
          <Link
            to={`/profile?screen=${open}`}
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi"
          >
            Carry on where you left off
          </Link>
        </footer>
      ) : null}
    </main>
  );
}
