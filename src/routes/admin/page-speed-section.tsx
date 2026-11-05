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

async function rows(
  name: string,
  args: Record<string, unknown>,
): Promise<Read<Record<string, unknown>[]>> {
  try {
    const { data, error } = (await getSupabase().rpc(name, args)) as {
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
  const read = await rows('admin_page_speed', { days });
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

/** One load timing over time (20261105000000): first-paint, cards-after-tap… */
export async function fetchPageSpeedTrend(
  days: number,
  timing: string,
): Promise<Read<TrendPoint[]>> {
  const read = await rows('admin_page_speed_trend', { days, timing });
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

/** The screens whose cards are timed (CardsShown), and their names here. */
const CARD_SCREENS = [
  ['/events', 'Events'],
  ['/peers', 'Peers'],
] as const;

/** Cards shown, timed from opening the app and from tapping in. */
const CARD_TIMINGS = [
  ['cards-after-open', 'From opening the app'],
  ['cards-after-tap', 'From tapping in'],
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

function TrendTable({ points, unit }: { points: TrendPoint[]; unit: 'hour' | 'day' }) {
  return (
    <TableView label={`The ${unit === 'hour' ? 'hourly' : 'daily'} numbers as a table`}>
      <thead className="text-grey">
        <tr>
          <th className="px-2 py-1.5 text-left font-semibold">
            {unit === 'hour' ? 'Hour' : 'Day'}
          </th>
          <th className={HEAD}>Times</th>
          <th className={HEAD}>Typical</th>
          <th className={HEAD}>Slow end</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
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
  );
}

export function PageSpeedSection() {
  const [days, setDays] = useState<string>('7');
  const [speed, setSpeed] = useState<SpeedRow[] | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [cardsTrend, setCardsTrend] = useState<TrendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSpeed(null);
    setTrend(null);
    setCardsTrend(null);
    setError(null);
    void Promise.all([
      fetchPageSpeed(Number(days)),
      fetchPageSpeedTrend(Number(days), 'first-paint'),
      fetchPageSpeedTrend(Number(days), 'cards-after-tap'),
    ]).then(([summary, opening, cards]) => {
      if (!live) return;
      if (!summary.ok) setError(summary.error);
      else if (!opening.ok) setError(opening.error);
      else if (!cards.ok) setError(cards.error);
      else {
        setSpeed(summary.value);
        setTrend(opening.value);
        setCardsTrend(cards.value);
      }
    });
    return () => {
      live = false;
    };
  }, [days]);

  const unit = days === '1' ? 'hour' : 'day';
  const loads = speed?.filter((r) => r.kind === 'load') ?? [];
  const cardsOf = (screen: string, timing: string) =>
    loads.find((r) => r.screen === screen && r.metric === timing);
  const firstPaints = loads
    .filter((r) => r.metric === 'first-paint')
    .sort((a, b) => b.samples - a.samples);
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
      ) : speed === null || trend === null || cardsTrend === null ? (
        <p role="status" className="py-4 text-[0.8125rem] text-grey">
          Loading…
        </p>
      ) : speed.length === 0 ? (
        <p className="py-4 text-[0.8125rem] text-ink2">Nothing measured in this period yet.</p>
      ) : (
        <>
          <Subheading>Cards on Events and Peers</Subheading>
          <p className="mt-0.5 text-[0.75rem] text-ink2 leading-[1.45]">
            Until the cards are on screen with their data, not the grey placeholders.
          </p>
          <div className="mt-1.5 overflow-x-auto rounded-[12px] border border-line bg-paper">
            <table className="w-full text-[0.8125rem] text-ink">
              <thead className="text-grey">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Screen</th>
                  {CARD_TIMINGS.map(([timing, label]) => (
                    <th key={timing} className={HEAD}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CARD_SCREENS.map(([screen, name]) => (
                  <tr key={screen} className="border-line border-t">
                    <td className="px-2 py-1.5 text-left font-bold">{name}</td>
                    {CARD_TIMINGS.map(([timing]) => {
                      const row = cardsOf(screen, timing);
                      return (
                        <td key={timing} className={CELL}>
                          {row ? (
                            <>
                              {seconds(row.p50)} / {seconds(row.p90)}
                              <span className="block text-[0.6875rem] text-grey">
                                {row.samples} {row.samples === 1 ? 'time' : 'times'}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[0.71875rem] text-grey">Typical (p50) / slow end (p90).</p>

          <Subheading>Cards after tapping in, {unit === 'hour' ? 'by hour' : 'by day'}</Subheading>
          {cardsTrend.length > 0 ? (
            <>
              <SpeedTrendChart points={cardsTrend} unit={unit} />
              <TrendTable points={cardsTrend} unit={unit} />
            </>
          ) : (
            <p className="py-2 text-[0.8125rem] text-ink2">Nothing timed in this period yet.</p>
          )}

          <Subheading>
            First paint on opening the app, {unit === 'hour' ? 'by hour' : 'by day'}
          </Subheading>
          {trend.length > 0 ? (
            <>
              <SpeedTrendChart points={trend} unit={unit} />
              <TrendTable points={trend} unit={unit} />
            </>
          ) : (
            <p className="py-2 text-[0.8125rem] text-ink2">No app opens in this period.</p>
          )}
          {firstPaints.length > 0 ? (
            <TableView label="First paint by the screen it opened on">
              <thead className="text-grey">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Screen</th>
                  <th className={HEAD}>Opens</th>
                  <th className={HEAD}>Typical</th>
                  <th className={HEAD}>Slow end</th>
                </tr>
              </thead>
              <tbody>
                {firstPaints.map((row) => (
                  <tr key={row.screen} className="border-line border-t">
                    <td className="px-2 py-1.5 text-left font-mono text-[0.75rem]">{row.screen}</td>
                    <td className={CELL}>{row.samples}</td>
                    <td className={CELL}>{seconds(row.p50)}</td>
                    <td className={CELL}>{seconds(row.p90)}</td>
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
