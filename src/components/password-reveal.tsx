import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Spread on the input. Shown, a phone must not capitalize or correct it. */
export interface RevealedInput {
  type: 'password' | 'text';
  autoCapitalize: 'none';
  autoCorrect: 'off';
  spellCheck: false;
  className: string;
}

/**
 * Show or Hide beside a password (the owner, 2026-10-31). A word and not only
 * an eye, so somebody using Voice Control can say it. Pressing it leaves focus
 * in the field, so a phone's keyboard stays up.
 */
export function PasswordReveal({
  what,
  className,
  children,
}: {
  /** Finishes the button's name: "Show password". */
  what: string;
  /** The space above the field, which moves here so the button centres on it. */
  className: string;
  children: (input: RevealedInput) => React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const word = shown ? 'Hide' : 'Show';
  const Icon = shown ? EyeOff : Eye;
  return (
    <div className={cn('relative', className)}>
      {children({
        type: shown ? 'text' : 'password',
        autoCapitalize: 'none',
        autoCorrect: 'off',
        spellCheck: false,
        className: 'mt-0 pr-[5.5rem]',
      })}
      <button
        type="button"
        aria-label={`${word} ${what}`}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          setShown(!shown);
        }}
        className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center gap-1.5 rounded-r-[13px] px-3 font-bold text-[0.875rem] text-emphasis"
      >
        <Icon aria-hidden="true" className="h-[1.1em] w-[1.1em] flex-none" />
        {word}
      </button>
    </div>
  );
}
