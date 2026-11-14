import { useEffect, useId, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * How much the club notifies you (20261114060000; the owner, 2026-11-14,
 * from the plan of 2026-11-13): one choice of three, each saying what you
 * get. Everybody starts at Everything, so nothing changes until they choose.
 * Pushes only: the bell keeps everything at every level.
 *
 * Across the member's devices: the level is theirs, not this phone's.
 */

export type PushLevel = 'everything' | 'balanced' | 'needs';

export const LEVELS: { value: PushLevel; title: string; says: string }[] = [
  {
    value: 'everything',
    title: 'Everything',
    says: 'Every message, reply and reaction, as it happens.',
  },
  {
    value: 'balanced',
    title: 'Balanced',
    says: 'Messages, replies and events. Likes, reactions and news from organizations wait in the bell.',
  },
  {
    value: 'needs',
    title: 'Only what needs me',
    says: 'Direct messages, mentions, Important messages, requests waiting on you, and an event you’re going to starting soon. Everything else waits in the bell.',
  },
];

function isLevel(value: unknown): value is PushLevel {
  return value === 'everything' || value === 'balanced' || value === 'needs';
}

export function NotificationVolume() {
  const id = useId();
  /** Undefined while read. */
  const [level, setLevel] = useState<PushLevel | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getSupabase()
      .rpc('my_push_level')
      .then(({ data, error: failed }) => {
        // A database without the setting yet: draw nothing.
        if (!live || failed) return;
        setLevel(isLevel(data) ? data : 'everything');
      });
    return () => {
      live = false;
    };
  }, []);

  if (level === undefined) return null;

  async function choose(next: PushLevel) {
    if (next === level) return;
    const before = level;
    setLevel(next);
    setBusy(true);
    setError(null);
    const { data, error: failed } = (await getSupabase().rpc('set_push_level', {
      p_level: next,
    })) as { data: unknown; error: { message: string } | null };
    setBusy(false);
    if (failed) {
      setLevel(before);
      setError(describeError(failed, 'It was not changed.'));
      return;
    }
    if (isLevel(data)) setLevel(data);
  }

  return (
    <fieldset className="mt-3 border-line border-t pt-3">
      <legend className="float-left w-full font-bold font-head text-[0.875rem] text-ink">
        How much should the club notify you?
      </legend>
      <div className="clear-both mt-2 flex flex-col gap-2">
        {LEVELS.map((choice) => (
          <label
            key={choice.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-[11px] border px-3 py-2.5',
              level === choice.value ? 'border-emphasis bg-tint' : 'border-line',
            )}
          >
            <input
              type="radio"
              name={`${id}-level`}
              checked={level === choice.value}
              disabled={busy}
              onChange={() => {
                void choose(choice.value);
              }}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-action)]"
            />
            <span className="min-w-0">
              <span className="block font-bold text-[0.9375rem] text-ink">{choice.title}</span>
              <span className="block text-[0.8125rem] text-ink2 leading-[1.4]">{choice.says}</span>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
