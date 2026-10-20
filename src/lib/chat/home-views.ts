import { useCallback, useEffect, useRef } from 'react';
import { announcePostViewsChanged } from '@/lib/chat/views';
import { getSupabase } from '@/lib/supabase';

/**
 * A post seen on Home is a view (the owner, 2026-10-19; 20261019010000).
 *
 * Seen means at least half the card (or half the screen) on screen for a
 * second, so a card scrolled past does not count. The database keeps one view
 * per member per post, whatever else they did, so nothing here guards against
 * counting twice beyond not sending the same post again.
 */

export const SEEN_AFTER_MS = 1000;
const SEND_AFTER_MS = 1500;

const sent = new Set<string>();
const waiting = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function send() {
  timer = null;
  const ids = [...waiting];
  waiting.clear();
  if (ids.length === 0) return;
  // `.then`: a Supabase request is only sent when awaited or `.then`ed.
  void getSupabase()
    .rpc('chat_mark_posts_seen', { post_ids: ids })
    .then(({ error }) => {
      if (error) for (const id of ids) sent.delete(id);
      else announcePostViewsChanged();
    });
}

/** Half the card, or half the screen for a card taller than two screens. */
function enough(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  const screen = entry.rootBounds?.height ?? window.innerHeight;
  return entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= screen / 2;
}

function seen(postId: string) {
  if (sent.has(postId)) return;
  sent.add(postId);
  waiting.add(postId);
  timer ??= setTimeout(send, SEND_AFTER_MS);
}

/** For tests: forget what was sent. */
export function resetHomeViews() {
  sent.clear();
  waiting.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}

/** A ref for a Home card: records its post as seen once it has been read. */
export function useSeenOnHome(postId: string | null | undefined) {
  const observer = useRef<IntersectionObserver | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    observer.current?.disconnect();
    observer.current = null;
    if (dwell.current) clearTimeout(dwell.current);
    dwell.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return useCallback(
    (element: HTMLElement | null) => {
      stop();
      if (!element || !postId || sent.has(postId) || typeof IntersectionObserver === 'undefined')
        return;
      observer.current = new IntersectionObserver(
        ([entry]) => {
          if (entry && enough(entry)) {
            dwell.current ??= setTimeout(() => {
              stop();
              seen(postId);
            }, SEEN_AFTER_MS);
          } else if (dwell.current) {
            clearTimeout(dwell.current);
            dwell.current = null;
          }
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      observer.current.observe(element);
    },
    [postId, stop],
  );
}
