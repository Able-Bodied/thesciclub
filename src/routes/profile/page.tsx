import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { cn } from '@/lib/utils';
import { loadAnswers, saveAnswers } from '@/routes/profile/profile-api';
import {
  type Answer,
  type Answers,
  advancesItself,
  isAnswered,
  progressOf,
  type Question,
  questionsOn,
  SCREENS,
  toggleMany,
} from '@/routes/profile/questions';

/**
 * The profile survey.
 *
 * Twelve screens, each saved as it is left. Every question can be skipped — the
 * deck has to work for a half-filled profile anyway, and a form that will not
 * let you past a question you do not want to answer is a form you abandon
 * rather than one you answer honestly.
 *
 * Screens of nothing but single-choice questions advance themselves once
 * answered. On those there is genuinely nothing left to do, and asking somebody
 * to confirm it is a tap for no reason — the pattern is from the mock and it is
 * the thing that makes a twelve-screen survey feel short.
 */
export default function ProfileSurveyPage() {
  const account = useAccount();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account.status !== 'member') return;
    void loadAnswers().then((result) => {
      if (result.ok) setAnswers(result.answers);
      else setError(result.error);
      setLoading(false);
    });
  }, [account.status]);

  const screen = SCREENS[index];

  const commit = useCallback(
    (next: number) => {
      if (!screen || !account.userId) return;
      setSaving(true);
      saveAnswers(account.userId, screen.keys, answers)
        .then((result) => {
          if (!result.ok) {
            setError(result.error ?? 'Could not save that.');
            return;
          }
          setError(null);
          if (next >= SCREENS.length) {
            void navigate('/me', { replace: true });
            return;
          }
          setIndex(next);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Could not save that.');
        })
        .finally(() => {
          setSaving(false);
        });
    },
    [screen, account.userId, answers, navigate],
  );

  // A screen with nothing left to decide moves on by itself.
  useEffect(() => {
    if (!screen || loading || saving) return;
    if (!advancesItself(screen, answers)) return;
    const questions = questionsOn(screen, answers);
    if (!questions.every((q) => isAnswered(q, answers))) return;
    const timer = setTimeout(() => {
      commit(index + 1);
    }, 260);
    return () => {
      clearTimeout(timer);
    };
  }, [screen, answers, loading, saving, index, commit]);

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  if (!screen) return <Navigate to="/me" replace />;

  const questions = questionsOn(screen, answers);
  const progress = progressOf(answers);

  function set(key: string, value: Answer) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-canvas">
      <div className="flex-none px-[18px] pt-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (index === 0) void navigate('/me');
              else setIndex(index - 1);
            }}
            className="-ml-1.5 inline-flex items-center gap-0.5 py-1 font-semibold text-[14px] text-navy"
          >
            <ChevronLeft className="h-4 w-4" />
            {index === 0 ? 'Me' : 'Back'}
          </button>
          <span className="text-[12.5px] text-grey">
            {index + 1} of {SCREENS.length} · {progress.percent}% complete
          </span>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-navy transition-[width] duration-300"
            style={{ width: `${((index + 1) / SCREENS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-3">
        <h1 className="font-extrabold font-head text-[23px] text-ink leading-tight tracking-[-0.02em]">
          {screen.title}
        </h1>
        {screen.hint ? (
          <p className="mt-2 text-[13.4px] text-ink2 leading-[1.5]">{screen.hint}</p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-[14px] text-grey">Loading your answers…</p>
        ) : (
          questions.map((question) => (
            <QuestionBlock
              key={question.key}
              question={question}
              value={answers[question.key] ?? null}
              onChange={(v) => {
                set(question.key, v);
              }}
              solo={questions.length === 1}
            />
          ))
        )}
        <div className="h-4" />
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="mb-2.5 text-[13px] text-destructive leading-[1.45]">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => {
            commit(index + 1);
          }}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[15px] disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : index === SCREENS.length - 1 ? (
            'Finish'
          ) : (
            'Continue'
          )}
        </button>
        {/* Every question is skippable. The deck works on a half-filled profile,
            and a form that will not let you past is one you abandon. */}
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => {
            commit(index + 1);
          }}
          className="mt-1 flex min-h-[38px] w-full items-center justify-center font-bold text-[13.5px] text-grey"
        >
          Skip this one
        </button>
      </footer>
    </div>
  );
}

function QuestionBlock({
  question,
  value,
  onChange,
  solo,
}: {
  question: Question;
  value: Answer;
  onChange: (value: Answer) => void;
  solo: boolean;
}) {
  const selected = Array.isArray(value) ? value : [];
  const atCap = question.max !== undefined && selected.length >= question.max;

  return (
    <section className="mt-6">
      {solo ? null : (
        <h2 className="mb-2.5 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
          {question.title}
        </h2>
      )}

      {question.kind === 'text' ? (
        <textarea
          aria-label={question.title}
          placeholder={question.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="min-h-[120px] w-full resize-none rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[16px] leading-[1.5] outline-none focus:border-navy"
        />
      ) : null}

      {question.kind === 'yesno' ? (
        <div className="flex flex-wrap gap-2">
          {[true, false].map((option) => (
            <button
              key={String(option)}
              type="button"
              aria-pressed={value === option}
              onClick={() => {
                onChange(option);
              }}
              className={cn(
                'rounded-full px-4 py-2 font-semibold text-[13.5px]',
                value === option ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
              )}
            >
              {option ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      ) : null}

      {question.kind === 'one' ? (
        <div className="flex flex-wrap gap-2">
          {question.options?.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={value === option}
              onClick={() => {
                onChange(option);
              }}
              className={cn(
                'rounded-full px-3.5 py-2 font-semibold text-[13.5px]',
                value === option ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {question.kind === 'many' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {question.options?.map((option) => {
              const on = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && atCap}
                  onClick={() => {
                    onChange(toggleMany(selected, option, question.max));
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-semibold text-[13.5px]',
                    on ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
                    !on && atCap && 'opacity-40',
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                  {option}
                </button>
              );
            })}
          </div>
          {question.max !== undefined ? (
            <p className="mt-2 text-[12px] text-grey">
              {selected.length} of {question.max} chosen
              {atCap ? ' — deselect one to change your mind' : ''}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
