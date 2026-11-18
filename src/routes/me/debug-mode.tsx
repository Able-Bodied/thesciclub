import { useSyncExternalStore } from 'react';
import { debugState, setDebugEnabled, subscribeDebug } from '@/lib/debug-log';
import { cn } from '@/lib/utils';

/**
 * Debug mode's switch, in Me's club tools for an administrator (the owner,
 * 2026-11-18). On this device only: see lib/debug-log.ts.
 */
export function DebugMode() {
  const { enabled } = useSyncExternalStore(subscribeDebug, debugState, debugState);
  return (
    <div className="rounded-[17px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="font-extrabold font-head text-[0.96875rem] text-ink">Debug mode</p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {enabled
              ? 'On, on this device. The pill in the corner of each screen lists its requests and how long each took.'
              : 'Shows how long each request takes on every screen. Only on this device, and only you see it.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Debug mode"
          data-target="small"
          onClick={() => {
            setDebugEnabled(!enabled);
          }}
          className={cn(
            'relative h-[30px] w-[52px] flex-none rounded-full transition-colors',
            enabled ? 'bg-action hover:bg-action-hi' : 'bg-line hover:bg-grey',
          )}
        >
          <span
            className={cn(
              'absolute top-[3px] h-6 w-6 rounded-full bg-paper transition-[left]',
              enabled ? 'left-[25px]' : 'left-[3px]',
            )}
          />
        </button>
      </div>
    </div>
  );
}
