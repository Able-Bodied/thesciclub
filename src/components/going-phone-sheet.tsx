import { useCallback, useId, useRef, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { describeThrown } from '@/lib/describe-error';
import { useDialogFocus } from '@/lib/dialog-focus';
import { loadOwnPhone, saveOwnPhone } from '@/lib/event-phone';
import { formatPhoneInput, isCompletePhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * The small sheet that asks for a phone number when somebody presses Going
 * and the club has none for them.
 *
 * The RSVP is saved either way: the sheet opens beside the press, it does not
 * stand in front of it. Skip is a first-class answer, and once given it holds
 * for the rest of this browser session, so a member who changes their mind
 * about Going three times is asked once.
 */

const SKIPPED_KEY = 'sciclub.goingPhoneSkipped';

function skippedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SKIPPED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSkip(): void {
  try {
    window.sessionStorage.setItem(SKIPPED_KEY, '1');
  } catch {
    // Asked again next time, which is the harmless way to fail.
  }
}

export function GoingPhoneSheet({
  onSave,
  onSkip,
}: {
  /** Resolves to null on success, or to a sentence to show. */
  onSave: (typed: string) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  const fieldId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onSkip);

  function save() {
    if (saving || !isCompletePhone(typed)) return;
    setSaving(true);
    setFailure(null);
    void onSave(typed)
      .then((said) => {
        if (said) setFailure(said);
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'Your number was not saved.'));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close without adding a number"
        tabIndex={-1}
        onClick={onSkip}
        className="absolute inset-0 z-[70] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute z-[71] flex flex-col bg-paper',
          'inset-x-0 bottom-0 max-h-[88%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82%] lg:w-[480px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
          'lg:shadow-[0_24px_60px_rgba(10,20,35,.35)]',
        )}
      >
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />
        <div className="flex-1 overflow-y-auto px-[18px] pt-1 lg:pt-5">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            You are going. Add a phone number?
          </h2>
          <p className="mt-2 text-[0.84375rem] text-ink2 leading-[1.55]">
            The host gets your email, and this number if you add it, for this event only. It helps
            them reach you on the day. You can leave it out.
          </p>
          <label
            htmlFor={fieldId}
            className="mt-4 block font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]"
          >
            Phone number
          </label>
          <input
            id={fieldId}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={typed}
            placeholder="(408) 555-0112"
            onChange={(event) => {
              setTyped(formatPhoneInput(event.target.value));
            }}
            className="mt-2 min-h-[48px] w-full rounded-[13px] border-[1.6px] border-line bg-canvas px-[13px] text-[1rem] text-ink outline-none focus:border-emphasis focus:bg-paper"
          />
          {failure ? (
            <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
              {failure} You are still going.
            </p>
          ) : null}
        </div>
        <div className="flex flex-none items-center justify-between gap-2.5 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !isCompletePhone(typed)}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save number'}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * For a screen with Going buttons: call `askForPhone()` when somebody presses
 * Going, and render `sheet`. It opens only when the member has no number on
 * file and has not skipped this session; otherwise it does nothing, and the
 * RSVP has already gone.
 */
export function useGoingPhoneSheet(userId: string | null) {
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);

  const askForPhone = useCallback(() => {
    if (!userId || skippedThisSession()) return;
    void loadOwnPhone(userId).then((result) => {
      // A number that could not be read is not a reason to ask for one.
      if (result.ok && result.phone === null) setOpen(true);
    });
  }, [userId]);

  const sheet = open ? (
    <GoingPhoneSheet
      onSkip={() => {
        rememberSkip();
        setOpen(false);
      }}
      onSave={async (typed) => {
        if (!userId) return 'Sign in first.';
        const result = await saveOwnPhone(userId, typed);
        if (!result.ok) return result.error;
        announce('Number saved.');
        setOpen(false);
        return null;
      }}
    />
  ) : null;

  return { askForPhone, sheet };
}
