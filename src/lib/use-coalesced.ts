import { useEffect, useMemo, useRef } from 'react';
import { coalesce, RECOUNT_MS } from '@/lib/coalesce';

/**
 * `fn` at most once per `ms`, the last call always followed by a run, as the
 * badge recounts do. Stable across renders; a pending run is dropped on unmount.
 */
export function useCoalesced(fn: () => void, ms = RECOUNT_MS): () => void {
  const latest = useRef(fn);
  latest.current = fn;
  const call = useMemo(
    () =>
      coalesce(() => {
        latest.current();
      }, ms),
    [ms],
  );
  useEffect(
    () => () => {
      call.cancel();
    },
    [call],
  );
  return call;
}
