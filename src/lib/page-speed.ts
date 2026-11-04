import { matchPath } from 'react-router-dom';

/**
 * How fast the app is for the people using it (the owner, 2026-11-04;
 * 20261104010000).
 *
 * Each page load reports its own timings once (first byte, first paint,
 * largest paint, ready), and every request to the club reports how long it
 * took, named by what it asked for and never with its arguments. Nothing
 * identifies anybody: the screen is its pattern, and a random id groups one
 * visit. Sent in batches, and dropped quietly if sending fails.
 */

/** The app's screens (App.tsx), so an address is kept only as its pattern. */
const SCREENS = [
  '/',
  '/admin',
  '/app-sign-in',
  '/chat',
  '/chat/new',
  '/chat/new-group',
  '/chat/rooms/new',
  '/chat/rooms/:id',
  '/chat/rooms/:id/new',
  '/chat/rooms/:id/topics/:id',
  '/chat/t/:id',
  '/chat/t/:id/members',
  '/delete-account',
  '/e/:id',
  '/e/:id/register',
  '/events',
  '/events/new',
  '/events/invites',
  '/events/organizations/:id',
  '/events/organizations/:id/review',
  '/events/:id',
  '/events/:id/check-in',
  '/events/:id/check-ins',
  '/events/:id/edit',
  '/events/:id/guests',
  '/events/:id/review',
  '/home',
  '/home/new',
  '/introductions/:id',
  '/invites',
  '/join',
  '/me',
  '/me/qr',
  '/me/saved',
  '/notifications',
  '/organizations/manage',
  '/partner',
  '/peers',
  '/peers/:id',
  '/privacy',
  '/profile',
  '/profile/answers',
  '/profile/details',
  '/request-invite',
  '/reset-password',
  '/share',
  '/stats',
  '/terms',
];

/** The screen an address is, as its pattern: /events/:id, never which one. */
export function screenOf(pathname: string): string {
  for (const pattern of SCREENS) {
    if (matchPath({ path: pattern, end: true }, pathname)) return pattern;
  }
  return '/other';
}

/**
 * What a request to the club asked for, without its arguments: an rpc or a
 * table by name, auth or a function by its step, storage as one.
 */
export function endpointOf(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const parts = path.split('/').filter(Boolean);
  const [service, , kind, name] = parts;
  if (service === 'rest') {
    if (kind === 'rpc' && name) return `rpc:${name}`;
    return kind ? `table:${kind}` : null;
  }
  if (service === 'auth') return `auth:${kind ?? ''}`;
  if (service === 'functions') return kind ? `fn:${kind}` : null;
  if (service === 'storage') return 'storage';
  return null;
}

interface Sample {
  visit: string;
  kind: 'load' | 'request';
  screen: string;
  metric: string;
  ms: number;
  ok: boolean;
  installed: boolean;
  mobile: boolean;
  connection: string | null;
}

/** Enough to see a pattern; past it, a long visit stops reporting requests. */
const MAX_REQUESTS_PER_VISIT = 300;
const BATCH = 50;
const FLUSH_MS = 30_000;
const LOG_RPC = 'log_page_speed';

type Sender = (samples: Sample[]) => Promise<unknown>;

let sender: Sender | null = null;
let queue: Sample[] = [];
let requestsSeen = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const visit = randomId();

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function context(): Pick<Sample, 'installed' | 'mobile' | 'connection'> {
  let installed = false;
  try {
    installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    // Unknown counts as the browser.
  }
  const connection =
    (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null;
  return {
    installed,
    mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
    connection,
  };
}

function push(sample: Omit<Sample, 'visit' | 'installed' | 'mobile' | 'connection'>) {
  if (!Number.isFinite(sample.ms) || sample.ms < 0) return;
  queue.push({ ...sample, ms: Math.round(sample.ms), visit, ...context() });
  if (queue.length >= BATCH) {
    flush();
    return;
  }
  timer ??= setTimeout(flush, FLUSH_MS);
}

/** Sends what is waiting. Failures are dropped: speed is never worth an error. */
export function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!sender || queue.length === 0) return;
  const batch = queue.slice(0, BATCH);
  queue = queue.slice(BATCH);
  try {
    void sender(batch).catch(() => undefined);
  } catch {
    // An unconfigured client throws at once; dropped all the same.
  }
  if (queue.length > 0) timer = setTimeout(flush, FLUSH_MS);
}

/**
 * A fetch for the club's client that times each request. The log's own call
 * is not timed, or every batch would make the next.
 */
export function timedFetch(base: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const endpoint = endpointOf(url);
    if (!endpoint || endpoint === `rpc:${LOG_RPC}`) return base(input, init);
    const started = performance.now();
    try {
      const response = await base(input, init);
      record(endpoint, performance.now() - started, response.ok);
      return response;
    } catch (thrown) {
      record(endpoint, performance.now() - started, false);
      throw thrown;
    }
  };
}

function record(endpoint: string, ms: number, ok: boolean) {
  if (requestsSeen >= MAX_REQUESTS_PER_VISIT) return;
  requestsSeen += 1;
  push({ kind: 'request', screen: screenOf(window.location.pathname), metric: endpoint, ms, ok });
}

/**
 * Starts reporting: the load's own timings once it has settled, and every
 * request from then on. `send` is the club's log call; it is given rather
 * than imported so the club's client can use timedFetch without a cycle.
 */
export function startPageSpeed(send: Sender): void {
  sender = send;
  const screen = screenOf(window.location.pathname);

  let largestPaint: number | null = null;
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) largestPaint = last.startTime;
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Safari has no largest paint; the other timings still go.
  }

  const report = () => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const firstPaint = performance
      .getEntriesByType('paint')
      .find((entry) => entry.name === 'first-contentful-paint');
    if (navigation) {
      push({ kind: 'load', screen, metric: 'first-byte', ms: navigation.responseStart, ok: true });
      push({
        kind: 'load',
        screen,
        metric: 'ready',
        ms: navigation.domContentLoadedEventEnd,
        ok: true,
      });
    }
    if (firstPaint) {
      push({ kind: 'load', screen, metric: 'first-paint', ms: firstPaint.startTime, ok: true });
    }
    if (largestPaint !== null) {
      push({ kind: 'load', screen, metric: 'largest-paint', ms: largestPaint, ok: true });
    }
    flush();
  };

  // Settled: some seconds after load, so the largest paint has happened.
  const afterLoad = () => setTimeout(report, 5000);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  // Whatever is waiting goes when the page is put away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** For tests. */
export function resetPageSpeed(): void {
  sender = null;
  queue = [];
  requestsSeen = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}
