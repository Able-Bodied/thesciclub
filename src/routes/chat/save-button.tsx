import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Save a topic, beside Mute. The word is the state; the name is the action. */
export function SaveTopicButton({
  saved,
  onToggle,
  failure,
  disabled = false,
}: {
  saved: boolean;
  onToggle: () => void;
  failure: string | null;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={saved}
        aria-label={saved ? 'Saved topic. Press to remove it from Saved.' : 'Save this topic'}
        data-target="small"
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-[0.85em] py-[0.45em] font-bold font-head text-[0.75rem] text-emphasis leading-[1.3] transition-colors disabled:opacity-50',
          saved ? 'border-transparent bg-tint hover:bg-line' : 'border-line hover:bg-tint',
        )}
      >
        <Bookmark
          aria-hidden="true"
          className={cn('h-[1.1em] w-[1.1em] flex-none', saved ? 'fill-current' : 'fill-none')}
        />
        {saved ? 'Saved' : 'Save'}
      </button>
      {failure ? (
        <span role="alert" className="mt-1 text-[0.75rem] text-destructive leading-[1.4]">
          {failure}
        </span>
      ) : null}
    </span>
  );
}
