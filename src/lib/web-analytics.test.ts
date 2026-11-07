import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countVisit, resetCountVisit, START_MS } from '@/lib/web-analytics';

const ORIGIN = 'https://count.example';
const EVENT = '/events/0b8f3a52-1c7e-4c1e-9d4e-2f6a7b8c9d0e';

function frames(): HTMLIFrameElement[] {
  return [...document.body.querySelectorAll('iframe')];
}

/** Starts the frame and lets it load, with its posts caught. */
function started(): ReturnType<typeof vi.fn> {
  vi.advanceTimersByTime(START_MS);
  const [frame] = frames();
  if (!frame?.contentWindow) throw new Error('no frame');
  const post = vi.fn();
  vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(post);
  frame.dispatchEvent(new Event('load'));
  return post;
}

describe('counting visits in a frame on another origin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROD', true);
    resetCountVisit();
  });
  afterEach(() => {
    resetCountVisit();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('opens one hidden frame, a second in, on the kind of page and nothing else', () => {
    countVisit('/', ORIGIN);
    countVisit(EVENT, ORIGIN);
    expect(frames()).toHaveLength(0);
    vi.advanceTimersByTime(START_MS);
    const [frame] = frames();
    expect(frames()).toHaveLength(1);
    expect(frame?.src).toBe(`${ORIGIN}/events/:id`);
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame?.referrerPolicy).toBe('no-referrer');
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
  });

  it('tells the frame each new kind of page, once, to its origin only', () => {
    countVisit('/home', ORIGIN);
    const post = started();
    expect(post).not.toHaveBeenCalled();
    countVisit(EVENT, ORIGIN);
    countVisit('/events/1d2c3b4a-0000-4000-8000-000000000000', ORIGIN);
    countVisit('/chat/t/abc', ORIGIN);
    expect(post.mock.calls).toEqual([
      ['/events/:id', ORIGIN],
      ['/chat/t/:id', ORIGIN],
    ]);
    expect(frames()).toHaveLength(1);
  });

  it('sends the page moved to before the frame loaded', () => {
    countVisit('/home', ORIGIN);
    vi.advanceTimersByTime(START_MS);
    countVisit('/peers', ORIGIN);
    const [frame] = frames();
    if (!frame?.contentWindow) throw new Error('no frame');
    const post = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => undefined);
    frame.dispatchEvent(new Event('load'));
    expect(post).toHaveBeenCalledWith('/peers', ORIGIN);
  });

  it('never sends what is in the address beyond its kind', () => {
    countVisit('/join', ORIGIN);
    vi.advanceTimersByTime(START_MS);
    expect(frames()[0]?.src).toBe(`${ORIGIN}/join`);
    resetCountVisit();
    countVisit('/auth/confirm.html', ORIGIN);
    vi.advanceTimersByTime(START_MS);
    expect(frames()[0]?.src).toBe(`${ORIGIN}/other`);
  });

  it('opens nothing in the store app, without its address, or outside a build', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    countVisit('/home', ORIGIN);
    vi.restoreAllMocks();
    countVisit('/home', '');
    vi.stubEnv('PROD', false);
    countVisit('/home', ORIGIN);
    vi.advanceTimersByTime(START_MS);
    expect(frames()).toHaveLength(0);
  });
});
