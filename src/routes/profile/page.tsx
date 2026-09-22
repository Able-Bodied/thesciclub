import { Check, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { cn } from '@/lib/utils';
import { loadAnswers, saveAnswers, saveDeclined } from '@/routes/profile/profile-api';
import {
  type Answer,
  type Answers,
  advancesItself,
  canDecline,
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
  // Loaded and written alongside the answers, because declining is an answer —
  // see 20260917030000. Held as a Set because every use of it is a membership
  // test and the array is only the shape the database stores.
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          setError(describeThrown(e, 'Could not save that.'));
        })
        .finally(() => {
          setSaving(false);
        });
    },
    [screen, account.userId, answers, navigate],
  );

  /**
   * Record that this screen's questions are ones they would rather not answer,
   * and move on.
   *
   * Pressed again on a screen already declined, it takes the decline back
   * rather than doing nothing — somebody who changes their mind should not
   * have to guess that the only way out is to type an answer. The whole set is
   * written because that is the shape the column holds; see saveDeclined.
   */
  const decline = useCallback(() => {
    if (!screen || !account.userId) return;
    const keys = questionsOn(screen, answers)
      .map((q) => q.key)
      .filter(canDecline);
    if (keys.length === 0) return;

    const undoing = keys.every((k) => declined.has(k));
    const next = new Set(declined);
    for (const key of keys) {
      if (undoing) next.delete(key);
      else next.add(key);
    }
    setDeclined(next);

    setSaving(true);
    saveDeclined(account.userId, next)
      .then((result) => {
        if (!result.ok) {
          // Put it back. A decline that silently failed would show a finished
          // ring on Me and an unfinished one on the next load.
          setDeclined(declined);
          setError(result.error ?? 'Could not save that.');
          return;
        }
        setError(null);
        if (!undoing) commit(index + 1);
      })
      .catch((e: unknown) => {
        setDeclined(declined);
        setError(describeThrown(e, 'Could not save that.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }, [screen, account.userId, answers, declined, index, commit]);

  /**
   * Whether the screen we are on was already complete when we arrived on it.
   *
   * This is what stops auto-advance from being a trap. A screen of
   * single-choice questions should move on when somebody *answers* the last
   * one — but arriving at a screen that is already answered, which is exactly
   * what happens when you press Back to change something, must not bounce you
   * straight out again. Without this you can never revise an answer on
   * Education, Day to day, Family or Mentoring: the screen ejects you before
   * you can touch it.
   */
  const completeOnArrival = useRef(false);
  const arrivedAt = useRef(-1);

  useEffect(() => {
    if (!screen || loading) return;
    if (arrivedAt.current === index) return;
    arrivedAt.current = index;
    completeOnArrival.current = questionsOn(screen, answers).every((q) =>
      isAnswered(q, answers, declined),
    );
  }, [screen, index, answers, declined, loading]);

  // A screen with nothing left to decide moves on by itself — but only if the
  // person decided it here, not if it was already done before they arrived.
  useEffect(() => {
    if (!screen || loading || saving) return;
    if (arrivedAt.current !== index) return;
    if (completeOnArrival.current) return;
    if (!advancesItself(screen, answers)) return;
    const questions = questionsOn(screen, answers);
    if (questions.length === 0) return;
    if (!questions.every((q) => isAnswered(q, answers, declined))) return;
    const timer = setTimeout(() => {
      commit(index + 1);
    }, 260);
    return () => {
      clearTimeout(timer);
    };
  }, [screen, answers, declined, loading, saving, index, commit]);

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  if (!screen) return <Navigate to="/me" replace />;

  const questions = questionsOn(screen, answers);
  const progress = progressOf(answers, declined);
  const declinable = questions.filter((q) => canDecline(q.key));
  const alreadyDeclined = declinable.length > 0 && declinable.every((q) => declined.has(q.key));

  function set(key: string, value: Answer) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  // Full viewport height on a phone, so the footer is pinned under the thumb.
  // On a desktop the page grows to its content instead: pinning put 461
  // measured pixels of empty canvas between the last answer and Continue, and
  // this flow asks twelve questions in a row.
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[520px] flex-col bg-canvas lg:h-auto lg:min-h-dvh">
      <div className="flex-none px-[18px] pt-4">
        <div className="flex min-h-[30px] items-center justify-between gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => {
                setIndex(index - 1);
              }}
              className="-ml-1.5 inline-flex items-center gap-0.5 py-1 font-semibold text-[0.875rem] text-navy"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}
          {/* The way out, on every screen and not only the first.
              
              Twelve screens with Back was the only exit, so somebody eight
              questions in who wanted to stop had to walk back through all of
              them. It commits first — `commit` past the last screen is the same
              path Finish takes — so leaving keeps the answers on the screen
              you are looking at, which pressing Back never did. */}
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => {
              commit(SCREENS.length);
            }}
            className="-mr-1.5 inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 font-semibold text-[0.875rem] text-navy transition-colors hover:bg-tint disabled:opacity-40"
          >
            Finish later
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-navy transition-[width] duration-300"
            style={{ width: `${((index + 1) / SCREENS.length) * 100}%` }}
          />
        </div>
        {/* Under the bar it describes, rather than beside the buttons, which
            now hold the two ways out. */}
        <p className="mt-1.5 text-right text-[0.78125rem] text-grey">
          {index + 1} of {SCREENS.length} · {progress.percent}% complete
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-3 lg:flex-none lg:overflow-visible">
        <h1 className="font-extrabold font-head text-[1.4375rem] text-ink leading-tight tracking-[-0.02em]">
          {screen.title}
        </h1>
        {screen.hint ? (
          <p className="mt-2 text-[0.8375rem] text-ink2 leading-[1.5]">{screen.hint}</p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-[0.875rem] text-grey">Loading your answers…</p>
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
          <p className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => {
            commit(index + 1);
          }}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : index === SCREENS.length - 1 ? (
            'Finish'
          ) : (
            'Continue'
          )}
        </button>
        {/* Two different things, and the difference is the point.

            Skip leaves the answer blank, which is honestly indistinguishable
            from "have not got to it yet" — so the ring keeps counting it as
            undone and the profile stays unfinished, which is right for
            somebody who means to come back.

            Prefer not to say is a decision, and the ring counts it. Without it
            somebody who is never going to answer this one is shown an
            unfinished profile for ever with no way to say otherwise, which is
            what the owner asked for. Collapsing the two would either nag the
            people who have decided or quietly finish a profile somebody meant
            to return to. */}
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => {
              commit(index + 1);
            }}
            className="flex min-h-[38px] flex-1 basis-[9rem] items-center justify-center rounded-[13px] font-bold text-[0.84375rem] text-grey transition-colors hover:bg-tint hover:text-ink2"
          >
            Skip this one
          </button>
          {declinable.length > 0 ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => {
                decline();
              }}
              aria-pressed={alreadyDeclined}
              className={cn(
                'flex min-h-[38px] flex-1 basis-[9rem] items-center justify-center rounded-[13px] font-bold text-[0.84375rem] transition-colors',
                alreadyDeclined
                  ? 'bg-tint text-ink2 hover:bg-line'
                  : 'text-grey hover:bg-tint hover:text-ink2',
              )}
            >
              {alreadyDeclined ? 'Rather not say ✓' : 'Rather not say'}
            </button>
          ) : null}
        </div>
      </footer>
    </main>
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

  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');
  const otherInputRef = useRef<HTMLInputElement>(null);

  // The box is opened by the member's own tap, so the caret belongs in it —
  // moved here rather than with autoFocus so it happens on opening and not on
  // every render, and so a screen reader is told about the box that appeared.
  useEffect(() => {
    if (otherOpen) otherInputRef.current?.focus();
  }, [otherOpen]);

  // Answers this member typed rather than picked. Derived from what is saved,
  // not remembered in state, so they survive a reload and a walk back through
  // the survey with Back.
  //
  // It follows that tapping one off removes its chip rather than leaving it
  // unselected, and that is the right way round: an offered option is always
  // there to pick up again, but one of your own is on the screen because you
  // chose it, and an unchosen one is just gone.
  const ownAnswers = selected.filter((answer) => !question.options?.includes(answer));

  function closeOther() {
    setOtherOpen(false);
    setOtherDraft('');
  }

  function addOther() {
    const entry = otherDraft.trim().replace(/\s+/g, ' ');
    if (!entry) return;

    // Matched without case, so "back to school" does not become a second chip
    // beside "Back to school". The first spelling wins; the member can remove
    // it if they want the other.
    const already = [...(question.options ?? []), ...selected].find(
      (existing) => existing.toLowerCase() === entry.toLowerCase(),
    );
    const answer = already ?? entry;

    if (!selected.includes(answer)) onChange(toggleMany(selected, answer, question.max));
    closeOther();
  }

  return (
    <section className="mt-6">
      {solo ? null : (
        <h2 className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
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
          className="min-h-[120px] w-full resize-none rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] leading-[1.5] outline-none focus:border-navy"
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
                'rounded-full px-4 py-2 font-semibold text-[0.84375rem]',
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
                'rounded-full px-3.5 py-2 font-semibold text-[0.84375rem]',
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
            {/* The offered options, then anything this member typed for
                themselves. Own answers render after, and identically — once it
                is chosen it is one of your answers, not a lesser kind. Without
                this second list a custom answer would be saved and then
                invisible, with no way to take it back off. */}
            {[...(question.options ?? []), ...ownAnswers].map((option) => {
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
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-semibold text-[0.84375rem]',
                    on ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
                    !on && atCap && 'opacity-40',
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                  {option}
                </button>
              );
            })}

            {/* "Add your own" rather than "Something else". The self-care list
                used to carry an option by that name, and two controls with one
                name on a screen is a coin toss for anybody reading it out; the
                option is gone now, and this is still the better name — it says
                what pressing it does rather than naming the gap it fills. */}
            {question.allowOther && !otherOpen && !atCap ? (
              <button
                type="button"
                onClick={() => {
                  setOtherOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line border-dashed bg-paper px-3.5 py-2 font-semibold text-[0.84375rem] text-navy"
              >
                <Plus className="h-3.5 w-3.5" />
                Add your own
              </button>
            ) : null}
          </div>

          {question.allowOther && otherOpen ? (
            <div className="mt-2.5 flex gap-2">
              {/* Enter submits, because a one-line box that ignores Enter is a
                  box people retype into. */}
              <input
                ref={otherInputRef}
                aria-label={`Your own answer — ${question.title}`}
                value={otherDraft}
                onChange={(e) => {
                  setOtherDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOther();
                  }
                  if (e.key === 'Escape') closeOther();
                }}
                placeholder={question.otherPlaceholder ?? 'In your own words'}
                className="min-h-[44px] min-w-0 flex-1 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 text-[1rem] outline-none focus:border-navy"
              />
              <button
                type="button"
                onClick={addOther}
                disabled={!otherDraft.trim()}
                className="min-h-[44px] flex-none rounded-[13px] bg-navy px-4 font-bold font-head text-[0.875rem] text-paper disabled:opacity-40"
              >
                Add
              </button>
            </div>
          ) : null}
          {question.max !== undefined ? (
            <p className="mt-2 text-[0.75rem] text-grey">
              {selected.length} of {question.max} chosen
              {atCap ? ' — deselect one to change your mind' : ''}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
