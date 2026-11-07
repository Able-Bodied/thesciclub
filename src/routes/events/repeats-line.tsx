import { Repeat } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchSeriesStarts } from '@/lib/events';
import { cn } from '@/lib/utils';
import { longWhen } from '@/routes/events/format';
import { cadenceOfStarts, repeatsLine } from '@/routes/events/series-groups';

/**
 * On a repeating event's page, under its time (the owner, 2026-11-06): how
 * often it repeats, worked out from its dates as the Events list does, and its
 * next two. Nothing for a one-off, and nothing until the dates are read.
 */
export function whatRepeats(
  starts: readonly string[],
  thisStart: string,
  timezone: string,
): string | null {
  if (starts.length === 0) return null;
  const said = repeatsLine(cadenceOfStarts(starts));
  const later = starts.filter((start) => Date.parse(start) > Date.parse(thisStart)).slice(0, 2);
  if (later.length === 0) return `${said} · this is the last date`;
  return `${said} · next ${later.map((start) => longWhen(start, timezone, true)).join(', ')}`;
}

export function RepeatsLine({
  seriesId,
  startTime,
  timezone,
  className,
}: {
  seriesId: string | null;
  startTime: string;
  timezone: string;
  className?: string;
}) {
  const [starts, setStarts] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    setStarts([]);
    if (!seriesId) return;
    void fetchSeriesStarts(seriesId).then((found) => {
      if (live) setStarts(found);
    });
    return () => {
      live = false;
    };
  }, [seriesId]);

  const line = seriesId ? whatRepeats(starts, startTime, timezone) : null;
  if (!line) return null;
  return (
    <p className={cn('flex items-start gap-1.5', className)}>
      <Repeat className="mt-[3px] h-[13px] w-[13px] flex-none" aria-hidden="true" />
      <span>{line}</span>
    </p>
  );
}
