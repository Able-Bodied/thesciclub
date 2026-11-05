import { useEffect, useState } from 'react';
import { SegmentPills } from '@/components/segment-pills';
import { describeError, describeThrown } from '@/lib/describe-error';
import { ONE_VISIT_IN } from '@/lib/page-speed';
import { getSupabase } from '@/lib/supabase';
import {
  RequestBars,
  SpeedTrendChart,
  seconds,
  type TrendPoint,
} from '@/routes/admin/speed-charts';

/**
 * Page speed, for administrators (the owner, 2026-11-04; 20261104010000):
 * how long the app takes to open over time, by screen, and which requests are
 * slowest. p50 is the typical time, p90 the slow end: one in ten took longer.
 * Each chart has a table with the same numbers.
 */

export interface SpeedRow {
  kind: 'load' | 'request';
  screen: string;
  metric: string;
  samples: number;
  visits: number;
  p50: number;
  p90: number;
  max: number;
  failed: number;
}

type Failure = Parameters<typeof describeError>[0];
type Read<T> = { ok: true; value: T } | { ok: false; error: string };

const REFUSAL = 'Could not load page speed.';

async function rows(name: string, days: number): Promise<Read<Record<string, unknown>[]>> {
  try {
    const { data, error } = (await getSupabase().rpc(name, { days })) as {
      data: Record<string, unknown>[] | null;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, REFUSAL) };
    return { ok: true, value: data ?? [] };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, REFUSAL) };
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export async function fetchPageSpeed(days: number): Promise<Read<SpeedRow[]>> {
  const read = await rows('admin_page_speed', days);
  if (!read.ok) return read;
  return {
    ok: true,
    value: read.value.map((row) => ({
      kind: row.kind === 'load' ? 'load' : 'request',
      screen: text(row.screen),
      metric: text(row.metric),
      samples: Number(row.samples ?? 0),
      visits: Number(row.visits ?? 0),
      p50: Number(row.p50_ms ?? 0),
      p90: Number(row.p90_ms ?? 0),
      max: Number(row.max_ms ?? 0),
      failed: Number(row.failed ?? 0),
    })),
  };
}

export async function fetchPageSpeedTrend(days: number): Promise<Read<TrendPoint[]>> {
  const read = await rows('admin_page_speed_trend', days);
  if (!read.ok) return read;
  return {
    ok: true,
    value: read.value.map((row) => ({
      bucket: text(row.bucket),
      loads: Number(row.loads ?? 0),
      p50: Number(row.p50_ms ?? 0),
      p90: Number(row.p90_ms ?? 0),
    })),
  };
}

const PERIODS = [
  ['1', '24 hours'],
  ['7', '7 days'],
  ['30', '30 days'],
] as const;

/** The load timings shown, in the order they happen. */
const LOAD_METRICS = [
  ['first-paint', 'First paint'],
  ['ready', 'Ready'],
] as const;

const CELL = 'px-2 py-1.5 text-right tabular-nums';
const HEAD = 'px-2 py-1.5 text-right font-semibold';

function Subheading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 font-bold text-[0.875rem] text-ink first:mt-2">{children}</h3>;
}

function TableView({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-2 font-bold text-[0.8125rem] text-emphasis">
        {label}
      </summary>
      <div className="overflow-x-auto rounded-[12px] border border-line bg-paper">
        <table className="w-full text-[0.8125rem] text-ink">{children}</table>
      </div>
    </details>
  );
}

export function PageSpeedSection() {
  const [days, setDays] = useState<string>('7');
  const [speed, setSpeed] = useState<SpeedRow[] | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSpeed(null);
    setTrend(null);
    setError(null);
    void Promise.all([fetchPageSpeed(Number(days)), fetchPageSpeedTrend(Number(days))]).then(
      ([summary, overTime]) => {
        if (!live) return;
        if (!summary.ok) setError(summary.error);
        else if (!overTime.ok) setError(overTime.error);
        else {
          setSpeed(summary.value);
          setTrend(overTime.value);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [days]);

  const unit = days === '1' ? 'hour' : 'day';
  const loads = speed?.filter((r) => r.kind === 'load') ?? [];
  const screens = [...new Set(loads.map((r) => r.screen))]
    .map((screen) => ({
      screen,
      visits: Math.max(0, ...loads.filter((r) => r.screen === screen).map((r) => r.visits)),
      by: new Map(loads.filter((r) => r.screen === screen).map((r) => [r.metric, r])),
    }))
    .sort((a, b) => b.visits - a.visits);
  const requests = (speed?.filter((r) => r.kind === 'request') ?? [])
    .slice()
    .sort((a, b) => b.p90 - a.p90)
    .slice(0, 12);

  return (
    <section aria-labelledby="page-speed-heading">
      <h2 id="page-speed-heading" className="mb-3 font-extrabold font-head text-[1rem] text-ink">
        Page speed
      </h2>
      <SegmentPills segments={PERIODS} value={days} onChange={setDays} className="pt-0" />
      {error ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : speed === null || trend === null ? (
        <p role="status" className="py-4 text-[0.8125rem] text-grey">
          Loading…
        </p>
      ) : speed.length === 0 ? (
        <p className="py-4 text-[0.8125rem] text-ink2">Nothing measured in this period yet.</p>
      ) : (
        <>
          <Subheading>Opening the app, {unit === 'hour' ? 'by hour' : 'by day'}</Subheading>
          {trend.length > 0 ? (
            <SpeedTrendChart points={trend} unit={unit} />
          ) : (
            <p className="py-2 text-[0.8125rem] text-ink2">No app opens in this period.</p>
          )}

          <Subheading>Opening the app, by screen</Subheading>
          <div className="mt-1 overflow-x-auto rounded-[12px] border border-line bg-paper">
            <table className="w-full text-[0.8125rem] text-ink">
              <thead className="text-grey">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Screen</th>
                  <th className={HEAD}>Loads</th>
                  {LOAD_METRICS.map(([, label]) => (
                    <th key={label} className={HEAD}>
                      {label} p50 / p90
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screens.map(({ screen, visits, by }) => (
                  <tr key={screen} className="border-line border-t">
                    <td className="px-2 py-1.5 text-left font-mono text-[0.75rem]">{screen}</td>
                    <td className={CELL}>{visits}</td>
                    {LOAD_METRICS.map(([metric]) => {
                      const row = by.get(metric);
                      return (
                        <td key={metric} className={CELL}>
                          {row ? `${seconds(row.p50)} / ${seconds(row.p90)}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trend.length > 0 ? (
            <TableView label={`The ${unit === 'hour' ? 'hourly' : 'daily'} numbers as a table`}>
              <thead className="text-grey">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">
                    {unit === 'hour' ? 'Hour' : 'Day'}
                  </th>
                  <th className={HEAD}>Loads</th>
                  <th className={HEAD}>Typical</th>
                  <th className={HEAD}>Slow end</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((p) => (
                  <tr key={p.bucket} className="border-line border-t">
                    <td className="px-2 py-1.5 text-left">
                      {new Date(p.bucket).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        ...(unit === 'hour' ? { hour: 'numeric' } : {}),
                        timeZone: 'America/Los_Angeles',
                      })}
                    </td>
                    <td className={CELL}>{p.loads}</td>
                    <td className={CELL}>{seconds(p.p50)}</td>
                    <td className={CELL}>{seconds(p.p90)}</td>
                  </tr>
                ))}
              </tbody>
            </TableView>
          ) : null}

          <Subheading>Slowest requests</Subheading>
          {requests.length > 0 ? (
            <>
              <RequestBars rows={requests} />
              <TableView label="The requests as a table">
                <thead className="text-grey">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Request</th>
                    <th className={HEAD}>Count</th>
                    <th className={HEAD}>Typical</th>
                    <th className={HEAD}>Slow end</th>
                    <th className={HEAD}>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => (
                    <tr key={row.metric} className="border-line border-t">
                      <td className="px-2 py-1.5 text-left font-mono text-[0.75rem]">
                        {row.metric}
                      </td>
                      <td className={CELL}>{row.samples}</td>
                      <td className={CELL}>{seconds(row.p50)}</td>
                      <td className={CELL}>{seconds(row.p90)}</td>
                      <td className={CELL}>{row.failed || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </TableView>
            </>
          ) : (
            <p className="py-2 text-[0.8125rem] text-ink2">No requests in this period.</p>
          )}
        </>
      )}
      <p className="mt-2 text-[0.75rem] text-grey leading-[1.45]">
        Measured on people’s own devices, not tied to anybody, and kept 30 days. One visit in{' '}
        {ONE_VISIT_IN} is measured, so visits are about 1/{ONE_VISIT_IN} of the real number. Typical
        (p50) is the middle time; the slow end (p90) is where one in ten took longer.
      </p>
    </section>
  );
}
