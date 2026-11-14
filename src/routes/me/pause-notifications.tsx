import { useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Pause every push for a while (20261113150000; the Fable review of the
 * notification plan, 2026-11-13): an hour, until tomorrow morning, or a week.
 * They resume by themselves, which switching off never does, and the bell
 * keeps everything meanwhile. Preset buttons, not a time picker, so it is one
 * press for anybody.
 *
 * Across the member's devices: the pause is theirs, not this phone's.
 */

/** 8am tomorrow, here; in the small hours, 8am today, which is what "tomorrow" means then. */
export function tomorrowMorning(now: Date): Date {
  const next = new Date(now);
  if (now.getHours() >= 4) next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next;
}

const CHOICES: { label: string; until: (now: Date) => Date }[] = [
  { label: 'For an hour', until: (now) => new Date(now.getTime() + 3_600_000) },
  { label: 'Until tomorrow morning', until: tomorrowMorning },
  { label: 'For a week', until: (now) => new Date(now.getTime() + 7 * 86_400_000) },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PauseNotifications() {
  /** Undefined while read; null when not paused. */
  const [until, setUntil] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getSupabase()
      .rpc('my_push_pause')
      .then(({ data, error: failed }) => {
        if (!live) return;
        // A database without Pause yet: draw nothing.
        if (failed) return;
        setUntil(typeof data === 'string' ? data : null);
      });
    return () => {
      live = false;
    };
  }, []);

  if (until === undefined) return null;

  async function pause(next: Date | null) {
    setBusy(true);
    setError(null);
    const { data, error: failed } = (await getSupabase().rpc('set_push_pause', {
      p_until: next ? next.toISOString() : null,
    })) as { data: unknown; error: { message: string } | null };
    setBusy(false);
    if (failed) {
      setError(describeError(failed, 'It was not changed.'));
      return;
    }
    setUntil(typeof data === 'string' ? data : null);
  }

  return (
    <div className="mt-3 border-line border-t pt-3">
      <p className="font-bold font-head text-[0.875rem] text-ink">Pause notifications</p>
      <p aria-live="polite" className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
        {until
          ? `Paused until ${when(until)}. Everything still waits in the bell.`
          : 'Nothing on any of your devices for a while. They come back by themselves, and the bell keeps everything.'}
      </p>
      {until ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void pause(null);
          }}
          className="mt-2.5 flex min-h-[44px] w-full items-center justify-center rounded-[11px] border-[1.6px] border-emphasis font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-50"
        >
          Resume now
        </button>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2">
          {CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              disabled={busy}
              onClick={() => {
                void pause(choice.until(new Date()));
              }}
              className="flex min-h-[44px] w-full items-center justify-center rounded-[11px] border border-line font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-50"
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
