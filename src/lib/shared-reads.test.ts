import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FACES_FRESH_MS,
  holdFacesFresh,
  onFacesStale,
  onPhotoBroke,
  PHOTO_RECHECK_MS,
  photoBroke,
} from '@/lib/shared-reads';

// Module-level listeners: counted, and zeroed before each test.
const told = { broke: 0, stale: 0 };
onPhotoBroke(() => {
  told.broke += 1;
});
onFacesStale(() => {
  told.stale += 1;
});

function seen(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
}

beforeEach(() => {
  told.broke = 0;
  told.stale = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('photoBroke', () => {
  // The robots, 2026-11-04: a face that broke inside the window was never re-read.
  it('reads once at the end of a window a face broke inside, and no more', () => {
    photoBroke();
    expect(told.broke).toBe(1);
    vi.advanceTimersByTime(1_000);
    photoBroke();
    photoBroke();
    expect(told.broke).toBe(1);
    vi.advanceTimersByTime(PHOTO_RECHECK_MS - 1_001);
    expect(told.broke).toBe(1);
    vi.advanceTimersByTime(1);
    expect(told.broke).toBe(2);
    vi.advanceTimersByTime(PHOTO_RECHECK_MS * 4);
    expect(told.broke).toBe(2);
  });
});

describe('holdFacesFresh', () => {
  const show = (state: DocumentVisibilityState) => {
    seen(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  // The owner, 2026-11-04: nothing on a timer while the page stays seen.
  it('tells nothing over minutes of a seen, idle page', () => {
    seen('visible');
    const release = holdFacesFresh();
    vi.advanceTimersByTime(10 * FACES_FRESH_MS);
    expect(told.stale).toBe(0);
    release();
  });

  it('tells the kept reads when the page is shown again, at most once a minute', () => {
    const release = holdFacesFresh();
    const second = holdFacesFresh();
    // Shown again soon after the screen opened: nothing.
    show('hidden');
    show('visible');
    expect(told.stale).toBe(0);
    vi.advanceTimersByTime(FACES_FRESH_MS);
    show('hidden');
    expect(told.stale).toBe(0);
    show('visible');
    expect(told.stale).toBe(1);
    vi.advanceTimersByTime(FACES_FRESH_MS - 1);
    show('hidden');
    show('visible');
    expect(told.stale).toBe(1);
    vi.advanceTimersByTime(1);
    show('hidden');
    show('visible');
    expect(told.stale).toBe(2);
    // No screen drawing faces: nothing.
    release();
    second();
    vi.advanceTimersByTime(FACES_FRESH_MS);
    show('hidden');
    show('visible');
    expect(told.stale).toBe(2);
  });
});
