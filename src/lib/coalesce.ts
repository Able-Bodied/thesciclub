/** At most one badge recount per this long, after the first. */
export const RECOUNT_MS = 1500;

export interface Coalesced {
  (): void;
  /** Drops a pending call; for when the screen closes. */
  cancel: () => void;
}

/**
 * The first call runs at once; calls within `ms` of a run become one more,
 * `ms` after it, so the last trigger is always followed by a run.
 */
export function coalesce(fn: () => void, ms: number): Coalesced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = Number.NEGATIVE_INFINITY;
  const run = () => {
    timer = null;
    last = Date.now();
    fn();
  };
  const call = () => {
    if (timer) return;
    const wait = last + ms - Date.now();
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };
  return Object.assign(call, {
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  });
}
