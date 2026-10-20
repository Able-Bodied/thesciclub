import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The frame every question sits in: a progress line, a back link, the
 * question, and the buttons right below it.
 *
 * Below the question rather than fixed to the bottom of the screen (the owner,
 * 2026-10-15): a phone's keyboard covers the bottom half, so a Continue down
 * there was hidden on every step that is typed into. Right under the answer
 * it stays in sight with the keyboard out, next to where the hand already is.
 */

export function StepFrame({
  stepNumber,
  totalSteps,
  onBack,
  children,
  footer,
  onSubmit,
}: {
  stepNumber: number | null;
  totalSteps: number;
  onBack?: (() => void) | undefined;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Runs when the step is submitted — by the footer button or by Enter. */
  onSubmit: () => void;
}) {
  const direction = useStepDirection(stepNumber);
  return (
    /*
     * A real form, so Enter finishes a step.
     *
     * Typing a number and reaching for Enter is what people do, and a wizard
     * that ignores it makes somebody move their hand to a button for every one
     * of eight screens. It also tells a phone keyboard to show Go rather than a
     * newline, which is the same fix in a different place.
     */
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {stepNumber === null ? (
          <div className="h-11 flex-none" />
        ) : (
          <div className="flex-none px-[18px] pt-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[0.78125rem] text-emphasis tracking-wide">
                THE SCI CLUB
              </span>
              <span className="text-[0.78125rem] text-grey">
                Step {stepNumber} of {totalSteps}
              </span>
            </div>
            {/* A bar per step, after React Bits' Stepper; the words above say it. */}
            <div aria-hidden="true" className="mt-2 flex gap-1">
              {Array.from({ length: totalSteps }, (_, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its position.
                  key={index}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-line"
                >
                  <div
                    className={cn(
                      'h-full origin-left bg-emphasis transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]',
                      index < stepNumber ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-x-hidden overflow-y-auto px-[18px]">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1.5 mt-2 inline-flex items-center gap-0.5 py-2 font-semibold text-[0.875rem] text-emphasis"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <div className="h-4" />
          )}
          {/* Keyed on the step, so each one slides in from the way it was reached. */}
          <div
            key={stepNumber ?? 'door'}
            className={cn(direction && 'step-in')}
            style={
              direction
                ? ({ '--step-from': `${direction * 24}px` } as React.CSSProperties)
                : undefined
            }
          >
            {children}
          </div>
          <footer className="pt-6 pb-[max(22px,env(safe-area-inset-bottom))]">{footer}</footer>
        </div>
      </form>
    </main>
  );
}

/** 1 for forward, -1 for back, 0 when the step has not moved. */
function useStepDirection(stepNumber: number | null): number {
  const [seen, setSeen] = useState({ step: stepNumber, direction: 0 });
  if (seen.step !== stepNumber) {
    const direction =
      stepNumber === null || seen.step === null ? 0 : stepNumber > seen.step ? 1 : -1;
    setSeen({ step: stepNumber, direction });
    return direction;
  }
  return seen.direction;
}

export function Question({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-2 font-extrabold font-display text-[1.5625rem] text-ink leading-tight tracking-[-0.01em]">
      {children}
    </h1>
  );
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">{children}</p>;
}

export function Fine({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[0.78125rem] text-grey leading-[1.5]">{children}</p>;
}

/**
 * Put the cursor in a step's field as soon as the step appears.
 *
 * Onboarding is one question per screen, and on every one of them typing is the
 * only thing to do — so making somebody tap the box first is a tap that exists
 * for no reason. It costs most on the code step, where a member is holding a
 * phone that has just buzzed with six digits, and most of all to anybody
 * driving this with a head pointer or a mouth stick, for whom a tap is not a
 * flick of the wrist.
 *
 * A field that already has an answer is selected rather than just focused, so
 * going back to change something means typing over it instead of clearing it
 * first.
 *
 * `preventScroll` because the fields sit near the top of a short screen; the
 * browser's own scroll-into-view jumps the layout for no gain.
 */
export function useAutoFocus<T extends HTMLInputElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el.value) el.select();
  }, [enabled]);
  return ref;
}

/**
 * A step's text field. Focused, it takes a navy border and a soft navy glow
 * around it: the border alone, one shade change on a field the step has just
 * focused by itself, read as nothing having happened (the owner, 2026-10-01,
 * about the code box). The border is what carries the contrast; the glow is
 * there to be seen at a glance.
 */
export function Field(props: React.ComponentPropsWithRef<'input'>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={cn(
        'mt-2.5 w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none transition-shadow focus:border-emphasis focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--navy)_18%,transparent)]',
        className,
      )}
    />
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    // Submits the step's form, so the button and Enter take the same path
    // rather than two that can drift apart.
    <button
      type="submit"
      {...props}
      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
    >
      {children}
    </button>
  );
}

export function LinkButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="mt-1 flex min-h-[40px] w-full items-center justify-center font-bold text-[0.875rem] text-emphasis"
    >
      {children}
    </button>
  );
}

/** A selectable chip. Used for level, completeness and city. */
export function Chip({
  selected,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={cn(
        'rounded-full px-3.5 py-2 font-semibold text-[0.84375rem] leading-[1.25]',
        'transition-colors',
        selected
          ? 'bg-action text-white hover:bg-action-hi'
          : 'border border-line bg-paper text-ink2 hover:bg-tint',
      )}
    >
      {children}
    </button>
  );
}
