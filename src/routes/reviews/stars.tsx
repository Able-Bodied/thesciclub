import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A rating, read out as words. */
export function Stars({ value, className }: { value: number; className?: string }) {
  const whole = Math.round(value);
  return (
    <span
      role="img"
      aria-label={`${value} out of 5 stars`}
      className={cn('inline-flex gap-0.5', className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn('h-4 w-4', n <= whole ? 'fill-gold text-gold' : 'text-line')}
        />
      ))}
    </span>
  );
}

/** Choosing a rating: five buttons, the one chosen pressed. */
export function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">Your rating</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
          onClick={() => {
            onChange(n);
          }}
          className="grid h-11 w-11 place-items-center"
        >
          <Star
            aria-hidden="true"
            className={cn('h-8 w-8', n <= value ? 'fill-gold text-gold' : 'text-grey')}
          />
        </button>
      ))}
    </fieldset>
  );
}
