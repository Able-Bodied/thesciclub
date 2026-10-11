import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECK_EVERY_MS, stayCurrent } from '@/lib/stay-current';

function fakeWorkers(inControl: boolean) {
  const events = new EventTarget();
  const update = vi.fn(() => Promise.resolve());
  const container = {
    controller: (inControl ? {} : null) as ServiceWorker | null,
    getRegistration: vi.fn(() =>
      Promise.resolve({ update } as unknown as ServiceWorkerRegistration),
    ),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const takeOver = () => events.dispatchEvent(new Event('controllerchange'));
  return { container, update, takeOver };
}

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

let stop: () => void = () => undefined;

beforeEach(() => {
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('looking for a new version', () => {
  it('asks each time the app comes back to the foreground', async () => {
    const { container, update } = fakeWorkers(true);
    stop = stayCurrent({ container, reload: vi.fn() });
    setVisibility('hidden');
    setVisibility('visible');
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  it('asks every half hour while open, but not in the background', async () => {
    vi.useFakeTimers();
    const { container, update } = fakeWorkers(true);
    stop = stayCurrent({ container, reload: vi.fn() });
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(update).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('shrugs off a check that fails offline', async () => {
    const { container, update } = fakeWorkers(true);
    update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    stop = stayCurrent({ container, reload: vi.fn() });
    setVisibility('hidden');
    setVisibility('visible');
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalled();
    });
  });
});

describe('catching up when a new version takes over', () => {
  it('reloads at once if nobody has touched the app since it came back', () => {
    const { container, takeOver } = fakeWorkers(true);
    const reload = vi.fn();
    stop = stayCurrent({ container, reload });
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits for the background if the member is using it', () => {
    const { container, takeOver } = fakeWorkers(true);
    const reload = vi.fn();
    stop = stayCurrent({ container, reload });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    takeOver();
    expect(reload).not.toHaveBeenCalled();
    setVisibility('hidden');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads at once if the app is already in the background', () => {
    const { container, takeOver } = fakeWorkers(true);
    const reload = vi.fn();
    stop = stayCurrent({ container, reload });
    window.dispatchEvent(new Event('pointerdown'));
    visibility = 'hidden';
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('forgets an old touch when the app comes back', () => {
    const { container, takeOver } = fakeWorkers(true);
    const reload = vi.fn();
    stop = stayCurrent({ container, reload });
    window.dispatchEvent(new Event('pointerdown'));
    setVisibility('hidden');
    setVisibility('visible');
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload for the first worker ever installed', () => {
    const { container, takeOver } = fakeWorkers(false);
    const reload = vi.fn();
    stop = stayCurrent({ container, reload });
    takeOver();
    setVisibility('hidden');
    expect(reload).not.toHaveBeenCalled();
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing in a browser without service workers', () => {
    expect(() => {
      stayCurrent({ container: undefined })();
    }).not.toThrow();
  });
});
