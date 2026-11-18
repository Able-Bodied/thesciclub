/**
 * Debug mode, for an administrator (the owner, 2026-11-18: "I want to see the
 * time it takes for the different RPCs to happen. I want to understand why it
 * takes as long to load the home feed").
 *
 * While it is on, every request the app makes to the club is kept here with
 * when it started and how long it took, grouped by the screen it was made on,
 * and the panel (components/debug-panel.tsx) draws them. page-speed.ts already
 * times each request for the speed charts; it tells this log too.
 *
 * On this device only: the switch is in this browser's storage, nothing here
 * is sent anywhere, and it is all gone on a reload. The switch is offered to
 * administrators (Me), and the panel is drawn for them alone.
 */

const KEY = 'sci-club:debug';
const SCREENS_KEPT = 6;
const REQUESTS_KEPT = 300;

export interface DebugRequest {
  /** `rpc:home_topics_ranked`, `table:chat_topics`, `auth:token` (page-speed's endpointOf). */
  endpoint: string;
  /** What it asked, for telling two reads of one table apart. Kept on this device. */
  detail: string;
  /** Milliseconds after the screen was reached. */
  at: number;
  ms: number;
  ok: boolean;
  /** The reply's size, when the server said. */
  bytes: number | null;
}

export interface DebugScreen {
  id: number;
  path: string;
  /** `performance.now()` when the screen was reached; 0 is opening the app. */
  startedAt: number;
  /** Reached by opening the app, so its times include the app starting. */
  opened: boolean;
  /** When its cards were drawn with their data, if it said. */
  cardsMs: number | null;
  requests: readonly DebugRequest[];
}

export interface DebugState {
  enabled: boolean;
  /** Oldest first; the last is the screen now shown. */
  screens: readonly DebugScreen[];
}

function stored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let state: DebugState = { enabled: typeof window !== 'undefined' && stored(), screens: [] };
const listeners = new Set<() => void>();
let nextId = 1;

function set(next: DebugState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function debugState(): DebugState {
  return state;
}

export function setDebugEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage refused (a private window): on for this page load all the same.
  }
  set({ enabled, screens: enabled ? state.screens : [] });
}

/** A screen was reached (page-speed's noteScreen). */
export function debugScreen(path: string, startedAt: number, opened: boolean) {
  if (!state.enabled) return;
  const screen: DebugScreen = {
    id: nextId,
    path,
    startedAt,
    opened,
    cardsMs: null,
    requests: [],
  };
  nextId += 1;
  set({ ...state, screens: [...state.screens, screen].slice(-SCREENS_KEPT) });
}

/** A request finished (page-speed's timedFetch). `started` is `performance.now()` at its start. */
export function debugRequest(
  endpoint: string,
  detail: string,
  started: number,
  ms: number,
  ok: boolean,
  bytes: number | null,
) {
  if (!state.enabled) return;
  // Before any screen was noted: the app's own start.
  const screens =
    state.screens.length > 0
      ? state.screens
      : [
          {
            id: 0,
            path: typeof window === 'undefined' ? '/' : window.location.pathname,
            startedAt: 0,
            opened: true,
            cardsMs: null,
            requests: [],
          } satisfies DebugScreen,
        ];
  const last = screens[screens.length - 1];
  if (!last || last.requests.length >= REQUESTS_KEPT) return;
  const request: DebugRequest = {
    endpoint,
    detail,
    at: Math.max(0, started - last.startedAt),
    ms,
    ok,
    bytes,
  };
  set({
    ...state,
    screens: [...screens.slice(0, -1), { ...last, requests: [...last.requests, request] }],
  });
}

/** The screen's cards were drawn with their data, `ms` after it was reached. */
export function debugCards(path: string, ms: number) {
  if (!state.enabled) return;
  const last = state.screens[state.screens.length - 1];
  if (last?.path !== path || last.cardsMs !== null) return;
  set({ ...state, screens: [...state.screens.slice(0, -1), { ...last, cardsMs: ms }] });
}

export interface DebugSummary {
  count: number;
  failed: number;
  /** From reaching the screen to the last reply. */
  lastReplyMs: number;
  /** Every request's time added up: more than `lastReplyMs` when they overlap. */
  addedMs: number;
  /** The one that took longest. */
  slowest: DebugRequest | null;
}

export function summarize(screen: DebugScreen): DebugSummary {
  const requests = screen.requests;
  return {
    count: requests.length,
    failed: requests.filter((request) => !request.ok).length,
    lastReplyMs: requests.reduce((latest, request) => Math.max(latest, request.at + request.ms), 0),
    addedMs: requests.reduce((sum, request) => sum + request.ms, 0),
    slowest: requests.reduce<DebugRequest | null>(
      (slow, request) => (slow === null || request.ms > slow.ms ? request : slow),
      null,
    ),
  };
}

/**
 * The requests that waited for one another, first to last: from the last
 * reply back, each time to the request that ended last before this one
 * began. They are why the screen took as long as it did; the rest ran beside
 * them. A request counts as waited for when it ended no later than a moment
 * (30 ms) after the next began.
 */
export function debugChain(screen: DebugScreen): DebugRequest[] {
  const end = (request: DebugRequest) => request.at + request.ms;
  let link = screen.requests.reduce<DebugRequest | null>(
    (last, request) => (last === null || end(request) > end(last) ? request : last),
    null,
  );
  const chain: DebugRequest[] = [];
  while (link) {
    chain.unshift(link);
    const began = link.at;
    link = screen.requests.reduce<DebugRequest | null>(
      (before, request) =>
        end(request) <= began + 30 && (before === null || end(request) > end(before))
          ? request
          : before,
      null,
    );
  }
  return chain;
}

/** "840 ms", "2.31 s". */
export function debugMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** The screen's requests as text, in the order they started, to paste somewhere. */
export function debugReport(screen: DebugScreen): string {
  const summary = summarize(screen);
  const rows = [...screen.requests]
    .sort((a, b) => a.at - b.at)
    .map(
      (request) =>
        `+${Math.round(request.at).toString().padStart(5)} ms  ${Math.round(request.ms).toString().padStart(5)} ms  ${request.ok ? '  ' : '✕ '}${request.endpoint}${request.bytes === null ? '' : `  ${request.bytes} bytes`}${request.detail ? `\n${' '.repeat(22)}${request.detail}` : ''}`,
    );
  return [
    `${screen.path}${screen.opened ? ' (opening the app)' : ''}`,
    `${summary.count} requests, last reply after ${debugMs(summary.lastReplyMs)}, ${debugMs(summary.addedMs)} added up${summary.failed ? `, ${summary.failed} failed` : ''}`,
    screen.cardsMs === null
      ? 'cards shown: not reported'
      : `cards shown after ${debugMs(screen.cardsMs)}`,
    `waited in a row: ${debugChain(screen)
      .map((request) => `${request.endpoint} ${debugMs(request.ms)}`)
      .join(', then ')}`,
    '',
    ' started     took   request',
    ...rows,
  ].join('\n');
}

/** For tests. */
export function resetDebugLog(enabled = false) {
  nextId = 1;
  state = { enabled, screens: [] };
}
