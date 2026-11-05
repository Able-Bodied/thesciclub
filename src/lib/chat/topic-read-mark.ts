import { announcePostViewsChanged } from '@/lib/chat/views';
import { missingFunction, viewDevice } from '@/lib/device';
import { announceNotificationsChanged } from '@/lib/notifications';
import { holdReturn, onPageReturn, pageHidden } from '@/lib/page-return';
import { getSupabase } from '@/lib/supabase';

/**
 * Marking a topic read, with fewer requests (free plan, 2026-11-05).
 *
 * A reload through the same post sends nothing; an open always does, since
 * only the server knows whether a like or reaction notice waits for it.
 * At most one call per topic per TOPIC_MARK_GAP_MS; the newest goes last,
 * or at once when the topic is left (flushTopicRead). While the page is
 * hidden nothing goes: the newest waits for the return (page-return.ts).
 */
export const TOPIC_MARK_GAP_MS = 2000;

interface Mark {
  /** The post last sent, or null when it failed. */
  sent: string | null;
  at: number;
  /** Waiting for the gap to pass. */
  pending: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const marks = new Map<string, Mark>();
let stopWaiting: (() => void) | null = null;

/** Once, on the return: every mark held while hidden goes. */
function waitForReturn() {
  stopWaiting ??= onPageReturn(() => {
    stopWaiting?.();
    stopWaiting = null;
    for (const [topicId, mark] of marks) if (mark.pending && !mark.timer) schedule(topicId, mark);
  });
}

function send(topicId: string, post: string, mark: Mark) {
  const supabase = getSupabase();
  // `.then`, not `void`: a request is only sent when awaited or thenned.
  const sent = supabase
    .rpc('chat_mark_topic_read_through', { topic: topicId, post, device: viewDevice() })
    .then(({ error }) =>
      missingFunction(error)
        ? supabase.rpc('chat_mark_topic_read_through', { topic: topicId, post })
        : { error },
    )
    .then(({ error }) => {
      if (error) {
        // The next reload tries again.
        if (mark.sent === post) mark.sent = null;
      } else {
        announcePostViewsChanged();
      }
      announceNotificationsChanged();
    });
  // On a return, the badges and the view counts wait for it.
  holdReturn(sent);
}

function fire(topicId: string, mark: Mark) {
  if (mark.timer) clearTimeout(mark.timer);
  mark.timer = null;
  const post = mark.pending;
  if (!post) return;
  if (pageHidden()) {
    waitForReturn();
    return;
  }
  mark.pending = null;
  mark.sent = post;
  mark.at = Date.now();
  send(topicId, post, mark);
}

/**
 * Read `topicId` through `post`. `opened`: the first load of a visit, which
 * is sent even through the same post, so a waiting notice is cleared.
 */
export function markTopicRead(topicId: string, post: string, opened: boolean): void {
  let mark = marks.get(topicId);
  if (!mark) {
    mark = { sent: null, at: Number.NEGATIVE_INFINITY, pending: null, timer: null };
    marks.set(topicId, mark);
  }
  if (!opened && mark.pending === null && mark.sent === post) return;
  mark.pending = post;
  schedule(topicId, mark);
}

/** Now, or once the gap since the last one has passed. */
function schedule(topicId: string, mark: Mark) {
  if (mark.timer) return;
  const wait = mark.at + TOPIC_MARK_GAP_MS - Date.now();
  if (wait <= 0) {
    fire(topicId, mark);
    return;
  }
  mark.timer = setTimeout(() => {
    fire(topicId, mark);
  }, wait);
}

/** Leaving the topic: a waiting mark goes now. */
export function flushTopicRead(topicId: string): void {
  const mark = marks.get(topicId);
  if (mark?.pending) fire(topicId, mark);
}

/** For tests. */
export function resetTopicReadMarks(): void {
  for (const mark of marks.values()) if (mark.timer) clearTimeout(mark.timer);
  marks.clear();
  stopWaiting?.();
  stopWaiting = null;
}
