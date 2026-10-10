import { cn } from '@/lib/utils';

/**
 * The two controls every panel on /admin is built out of.
 *
 * Moved here out of page.tsx when the Reports panel arrived and needed both.
 * Nothing about them changed: this is where they live now, rather than a
 * second copy that would drift from the first the next time the target size or
 * the destructive colour is reconsidered.
 */

/** The reason for something an administrator did. Only administrators ever read it. */
export function ReasonField({
  id,
  value,
  onChange,
  label = 'Reason (only administrators see this)',
  placeholder = 'Harassing members',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Overridden where "reason" is the wrong word for what is being asked. */
  label?: string;
  placeholder?: string;
}) {
  return (
    <label htmlFor={id} className="mt-2.5 block font-bold text-[0.75rem] text-ink">
      {label}
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="mt-1 w-full rounded-[10px] border-[1.6px] border-line bg-paper px-2.5 py-1.5 font-normal text-[0.84375rem] outline-none focus:border-emphasis"
      />
    </label>
  );
}

export function SmallButton({
  destructive,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'min-h-[44px] rounded-[10px] px-3 py-2 font-semibold text-[0.75rem] transition-colors',
        destructive
          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          : 'bg-tint text-emphasis hover:bg-line',
      )}
    >
      {children}
    </button>
  );
}
