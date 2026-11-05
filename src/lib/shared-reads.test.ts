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
  it('tells the kept reads each minute while a screen holds it and the page is seen', () => {
    seen('visible');
    const release = holdFacesFresh();
    const second = holdFacesFresh();
    vi.advanceTimersByTime(FACES_FRESH_MS - 1);
    expect(told.stale).toBe(0);
    vi.advanceTimersByTime(1);
    expect(told.stale).toBe(1);
    vi.advanceTimersByTime(FACES_FRESH_MS);
    expect(told.stale).toBe(2);
    release();
    second();
    vi.advanceTimersByTime(FACES_FRESH_MS * 3);
    expect(told.stale).toBe(2);
  });

  it('asks nothing while hidden, and once on being shown again', () => {
    seen('hidden');
    const release = holdFacesFresh();
    vi.advanceTimersByTime(FACES_FRESH_MS * 3);
    expect(told.stale).toBe(0);
    seen('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(told.stale).toBe(1);
    // Shown again with no tick missed: nothing.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(told.stale).toBe(1);
    release();
  });
});
