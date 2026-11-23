import { useState } from 'react';
import { SegmentPills } from '@/components/segment-pills';
import { seconds } from '@/routes/admin/speed-charts';

const PLATFORMS = [
  ['browser', 'Browser'],
  ['home-screen', 'Home Screen app'],
  ['ios-app', 'iPhone and iPad app'],
  ['android-app', 'Android app'],
  ['unknown', 'Platform unknown'],
] as const;
const METRICS = [
  ['first-paint', 'First paint'],
  ['cards-after-tap', 'Cards after a tap'],
] as const;
const MIN_SAMPLES = 5;
const RELEASE_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const HEADER = 'px-2 py-1.5 text-left font-semibold text-ink';
const CELL = 'px-2 py-2 align-top tabular-nums';

export interface PlatformSpeedRow {
  platform: (typeof PLATFORMS)[number][0];
  release: string;
  metric: (typeof METRICS)[number][0];
  samples: number;
  p50_ms: number;
  p90_ms: number;
}

export function releaseChange(
  current: PlatformSpeedRow,
  previous: PlatformSpeedRow | undefined,
  percentile: 'p50_ms' | 'p90_ms',
): number | null {
  if (
    !previous ||
    current.platform === 'unknown' ||
    current.samples < MIN_SAMPLES ||
    previous.samples < MIN_SAMPLES ||
    current.platform !== previous.platform ||
    current.metric !== previous.metric
  ) {
    return null;
  }
  return current[percentile] - previous[percentile];
}

function Time({ value, delta }: { value: number; delta: number | null }) {
  return (
    <>
      <span className="whitespace-nowrap font-semibold text-ink">{seconds(value)}</span>
      {delta !== null ? (
        <span
          className={`block whitespace-nowrap text-[0.71875rem] ${delta > 0 ? 'text-destructive' : 'text-ink2'}`}
        >
          {delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${seconds(Math.abs(delta))}`}
        </span>
      ) : null}
    </>
  );
}

export function ReleasePlatformSpeed({ rows }: { rows: PlatformSpeedRow[] }) {
  const [platform, setPlatform] = useState<PlatformSpeedRow['platform']>('browser');
  const [metric, setMetric] = useState<PlatformSpeedRow['metric']>('first-paint');
  const visiblePlatforms = PLATFORMS.filter(
    ([value]) => value !== 'unknown' || rows.some((row) => row.platform === 'unknown'),
  );
  const releases = rows
    .filter((row) => row.platform === platform && row.metric === metric)
    .sort((left, right) => right.release.localeCompare(left.release));

  return (
    <div className="mt-3 rounded-[14px] border border-line bg-paper p-3">
      <h3 className="font-semibold text-ink">Speed by platform</h3>
      <SegmentPills segments={visiblePlatforms} value={platform} onChange={setPlatform} />
      <SegmentPills segments={METRICS} value={metric} onChange={setMetric} className="pt-0" />
      <p className="text-[0.75rem] text-ink2">
        Typical is the median. One in ten samples took longer than the slow end (p90). Changes
        compare with the previous measured build for this platform and timing.
      </p>
      {platform === 'unknown' ? (
        <p className="mt-1 text-[0.75rem] text-ink2">These samples did not report a platform.</p>
      ) : null}
      {releases.length === 0 ? (
        <p className="mt-2 text-sm text-ink2">
          No measurements for this selection in the past 30 days.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[0.8125rem]">
            <caption className="sr-only">Release speed comparison</caption>
            <thead>
              <tr>
                <th scope="col" className={HEADER}>
                  Build
                </th>
                <th scope="col" className={HEADER}>
                  Typical
                </th>
                <th scope="col" className={HEADER}>
                  Slow end
                </th>
                <th scope="col" className={HEADER}>
                  Samples
                </th>
              </tr>
            </thead>
            <tbody>
              {releases.map((row, index) => {
                const previous = releases[index + 1];
                const date = new Date(`${row.release}Z`);
                return (
                  <tr key={row.release} className="border-line border-t">
                    <th scope="row" className={`${CELL} text-left font-medium text-ink`}>
                      {Number.isNaN(date.getTime()) ? row.release : RELEASE_DATE.format(date)}
                    </th>
                    <td className={CELL}>
                      <Time value={row.p50_ms} delta={releaseChange(row, previous, 'p50_ms')} />
                    </td>
                    <td className={CELL}>
                      <Time value={row.p90_ms} delta={releaseChange(row, previous, 'p90_ms')} />
                    </td>
                    <td className={CELL}>
                      {row.samples}
                      {row.samples < MIN_SAMPLES ? (
                        <span className="block text-[0.71875rem] text-ink2">Small sample</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
