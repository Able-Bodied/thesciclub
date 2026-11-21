import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The top of every profile step, details and questions alike (the owner,
 * 2026-11-14): Back, the way out, the bar, and where you are with the one
 * percentage Me shows.
 */
export function StepTop({
  onBack,
  doneLabel,
  onDone,
  disabled,
  position,
  total,
  percent,
}: {
  onBack: (() => void) | null;
  doneLabel: string;
  onDone: () => void;
  disabled: boolean;
  position: number;
  total: number;
  percent: number | null;
}) {
  return (
    <div className="flex-none px-[18px] pt-4">
      <div className="flex min-h-[30px] items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onBack}
            className="-ml-1.5 inline-flex items-center gap-0.5 py-1 font-semibold text-[0.875rem] text-emphasis disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={onDone}
          className="-mr-1.5 inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 font-semibold text-[0.875rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-40"
        >
          {doneLabel}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-emphasis transition-[width] duration-300"
          style={{ width: total > 0 ? `${(position / total) * 100}%` : '0%' }}
        />
      </div>
      <p className="mt-1.5 min-h-[1.2em] text-right text-[0.78125rem] text-grey">
        {total > 0 ? `${position} of ${total}` : null}
        {total > 0 && percent !== null ? ' · ' : null}
        {percent !== null ? `${percent}% complete` : null}
      </p>
    </div>
  );
}
