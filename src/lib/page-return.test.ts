import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  holdReturn,
  onPageReturn,
  onReturnSettled,
  RETURN_WAIT_MS,
  returnPending,
} from '@/lib/page-return';

function deferred() {
  let land: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    land = resolve;
  });
  return { promise, land };
}

const stops: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
});

describe('the end of a return', () => {
  it('comes at once when no screen holds it', () => {
    const settled = vi.fn();
    stops.push(onReturnSettled(settled));
    window.dispatchEvent(new Event('focus'));
    expect(settled).toHaveBeenCalledExactlyOnceWith(false);
    expect(returnPending()).toBe(false);
  });

  it('waits for a screen’s catch-up and the mark it sends after', async () => {
    const settled = vi.fn();
    const read = deferred();
    const mark = deferred();
    stops.push(
      onPageReturn(() => {
        holdReturn(
          read.promise.then(() => {
            holdReturn(mark.promise);
          }),
        );
      }),
      onReturnSettled(settled),
    );
    window.dispatchEvent(new Event('focus'));
    read.land();
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).not.toHaveBeenCalled();
    expect(returnPending()).toBe(true);
    mark.land();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledExactlyOnceWith(true);
    expect(returnPending()).toBe(false);
  });

  it('holds nothing outside a return, and gives up on a read that never answers', async () => {
    const settled = vi.fn();
    stops.push(onReturnSettled(settled));
    holdReturn(new Promise(() => undefined));
    expect(returnPending()).toBe(false);
    stops.push(
      onPageReturn(() => {
        holdReturn(new Promise(() => undefined));
      }),
    );
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(RETURN_WAIT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith(true);
  });
});
