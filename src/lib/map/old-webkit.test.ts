import { describe, expect, it } from 'vitest';
import { patchAbortSignal } from './old-webkit';

/** An AbortSignal as Safari 15.0–15.3 has it. */
function oldSignal(aborted: boolean) {
  const proto = {} as AbortSignal;
  patchAbortSignal(proto);
  return Object.assign(Object.create(proto) as AbortSignal, { aborted });
}

describe('AbortSignal on iOS 15.0 to 15.3', () => {
  it('gains reason and throwIfAborted, as pmtiles needs them', () => {
    expect(() => {
      oldSignal(false).throwIfAborted();
    }).not.toThrow();
    expect(oldSignal(false).reason).toBeUndefined();
    const aborted = oldSignal(true);
    expect((aborted.reason as DOMException).name).toBe('AbortError');
    expect(() => {
      aborted.throwIfAborted();
    }).toThrow(/aborted/);
  });

  it('leaves a browser that has them alone', () => {
    const before = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted');
    patchAbortSignal();
    expect(Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted')).toEqual(
      before,
    );
  });
});
