import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The frame every question sits in: a progress line, a back link, the question,
 * and a footer that is always in the same place.
 *
 * The footer is fixed to the bottom rather than flowing after the content so
 * the primary action does not move between steps. A button that jumps around
 * is harder to hit for anybody with limited hand function, which is most of the
 * people this is for.
 */

export function StepFrame({
  stepNumber,
  totalSteps,
  onBack,
  children,
  footer,
}: {
  stepNumber: number | null;
  totalSteps: number;
  onBack?: (() => void) | undefined;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      {stepNumber === null ? (
        <div className="h-11 flex-none" />
      ) : (
        <div className="flex-none px-[18px] pt-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[0.78125rem] text-navy tracking-wide">
              THE SCI CLUB
            </span>
            <span className="text-[0.78125rem] text-grey">
              Step {stepNumber} of {totalSteps}
            </span>
          </div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-navy transition-[width] duration-300"
              style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-[18px] pb-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1.5 mt-2 inline-flex items-center gap-0.5 py-2 font-semibold text-[0.875rem] text-navy"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div className="h-4" />
        )}
        {children}
        <div className="h-4" />
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        {footer}
      </footer>
    </div>
  );
}

export function Question({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-2 font-extrabold font-head text-[1.5625rem] text-ink leading-tight tracking-[-0.02em]">
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

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={cn(
        'mt-2.5 w-full rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] outline-none focus:border-navy',
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
    <button
      type="button"
      {...props}
      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] disabled:opacity-40"
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
      className="mt-1 flex min-h-[40px] w-full items-center justify-center font-bold text-[0.875rem] text-navy"
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
        selected ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
      )}
    >
      {children}
    </button>
  );
}
