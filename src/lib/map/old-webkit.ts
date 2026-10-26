/**
 * Safari 15.0 to 15.3 (the app's iOS floor is 15.0) lack these two, which
 * pmtiles and shared-tiles.ts use. Loaded with the map, never the app.
 */
export function patchAbortSignal(proto: AbortSignal = AbortSignal.prototype): void {
  if (!('reason' in proto)) {
    Object.defineProperty(proto, 'reason', {
      configurable: true,
      get(this: AbortSignal) {
        return this.aborted
          ? new DOMException('This operation was aborted', 'AbortError')
          : undefined;
      },
    });
  }
  if (typeof (proto as Partial<AbortSignal>).throwIfAborted !== 'function') {
    Object.defineProperty(proto, 'throwIfAborted', {
      configurable: true,
      writable: true,
      value(this: AbortSignal) {
        if (this.aborted) throw this.reason;
      },
    });
  }
}

if (typeof AbortSignal !== 'undefined') patchAbortSignal();
