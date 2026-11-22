import { type ReactNode, useEffect, useState } from 'react';
import { SegmentPills } from '@/components/segment-pills';
import { getSupabase } from './supabase';

/**
 * The admin site's own screens (the owner, 2026-11-22): Health (the free plan, uptime and the
 * alerts), Crashes, Sent (emails and pushes) and Releases. Only here, never in the app's Admin
 * tab: admin/ is the admin site's alone (CLAUDE.md, "The admin site"). The reads are the
 * admin_* functions of 20261122090000, refused to anybody but an administrator.
 */

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<Read<T>> {
  try {
    const { data, error } = (await getSupabase().rpc(name, args)) as {
      data: T | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false, error: error.message };
    return { ok: true, value: data as T };
  } catch (thrown) {
    return { ok: false, error: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}

function useRead<T>(load: () => Promise<Read<T>>, key: string): Read<T> | null {
  const [read, setRead] = useState<Read<T> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` names what the read depends on.
  useEffect(() => {
    let live = true;
    setRead(null);
    void load().then((value) => {
      if (live) setRead(value);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return read;
}

const PERIODS = [
  ['1', '24 hours'],
  ['7', '7 days'],
  ['30', '30 days'],
] as const;

export function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-5 mb-2 font-bold font-head text-[1rem] text-ink">{children}</h2>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[0.75rem] text-ink2 leading-[1.45]">{children}</p>;
}

function Waiting<T>({
  read,
  children,
}: {
  read: Read<T> | null;
  children: (value: T) => ReactNode;
}) {
  if (read === null) return <p className="py-2 text-[0.8125rem] text-grey">Loading…</p>;
  if (!read.ok) {
    return (
      <p role="alert" className="py-2 text-[0.8125rem] text-destructive">
        Could not read it: {read.error}
      </p>
    );
  }
  return <>{children(read.value)}</>;
}

const CARD = 'rounded-[14px] border border-line bg-paper px-3 py-2.5';

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  });
}

function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

interface PlanUsage {
  database_bytes: number;
  database_limit: number;
  files_bytes: number;
  files_limit: number;
  buckets: { bucket: string; bytes: number; files: number }[];
  tables: { table: string; bytes: number }[];
  connections: number;
  connections_limit: number;
  sent_bytes_month: number;
  sent_limit: number;
  members_active_month: number;
  active_limit: number;
}

function Meter({
  label,
  used,
  limit,
  shown,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  shown: string;
  note?: string;
}) {
  const share = limit > 0 ? used / limit : 0;
  const tone = share >= 0.9 ? 'bg-destructive' : share >= 0.7 ? 'bg-amber-500' : 'bg-emphasis';
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-ink2">{shown}</span>
      </div>
      <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full ${tone}`}
          style={{ width: `${String(Math.min(100, share * 100))}%` }}
        />
      </div>
      <p className="mt-1 text-[0.71875rem] text-grey">
        {Math.round(share * 100)}% of the free plan’s limit{note ? `. ${note}` : ''}
      </p>
    </div>
  );
}

interface Uptime {
  checks: number;
  failed: number;
  first_at: string | null;
  latest: { at: string; ok: boolean; ms: number | null; error: string | null } | null;
  hours: {
    hour: string;
    checks: number;
    failed: number;
    p50_ms: number | null;
    max_ms: number | null;
  }[];
  gaps: { from: string; to: string }[];
  alerts: { kind: string; opened_at: string; closed_at: string | null; detail: string | null }[];
}

const ALERT_NAMES: Record<string, string> = {
  app_down: 'App not answering',
  server_errors: 'Server errors',
};

export function Health() {
  const [days, setDays] = useState('7');
  const plan = useRead(() => call<PlanUsage>('admin_plan_usage'), 'plan');
  const uptime = useRead(() => call<Uptime>('admin_uptime', { p_days: Number(days) }), days);

  return (
    <div>
      <Heading>The free plan</Heading>
      <Note>
        The live Supabase project is on the free plan. Past a limit, Supabase slows or stops the
        club, so these are worth watching as it grows.
      </Note>
      <Waiting read={plan}>
        {(p) => (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Meter
                label="Database"
                used={p.database_bytes}
                limit={p.database_limit}
                shown={`${size(p.database_bytes)} of ${size(p.database_limit)}`}
              />
              <Meter
                label="Photos and files"
                used={p.files_bytes}
                limit={p.files_limit}
                shown={`${size(p.files_bytes)} of ${size(p.files_limit)}`}
              />
              <Meter
                label="Data sent this month"
                used={p.sent_bytes_month}
                limit={p.sent_limit}
                shown={`at least ${size(p.sent_bytes_month)} of ${size(p.sent_limit)}`}
                note="Only what the logs carry a size for, so the real figure is higher; Supabase’s Usage page has it exactly"
              />
              <Meter
                label="Connections now"
                used={p.connections}
                limit={p.connections_limit}
                shown={`${String(p.connections)} of ${String(p.connections_limit)}`}
              />
            </div>
            <p className="mt-2 text-[0.75rem] text-ink2">
              {p.members_active_month} members signed in this month (the free plan allows{' '}
              {p.active_limit.toLocaleString('en-US')}).
            </p>
            <details className="mt-2 text-[0.75rem] text-ink2">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">
                What takes the space
              </summary>
              <ul className="mt-1 space-y-0.5">
                {p.buckets.map((b) => (
                  <li key={b.bucket}>
                    Photos in {b.bucket}: {size(b.bytes)} ({b.files} files)
                  </li>
                ))}
                {p.tables.map((t) => (
                  <li key={t.table}>
                    Table {t.table}: {size(t.bytes)}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </Waiting>

      <Heading>Is the app up?</Heading>
      <Note>
        Supabase checks the app every 5 minutes. When it fails twice running, or the server’s errors
        pile up, every administrator gets a notification, and another when it is back.
      </Note>
      <SegmentPills segments={PERIODS} value={days} onChange={setDays} className="pt-1" />
      <Waiting read={uptime}>
        {(u) => (
          <>
            <p className="mt-1 text-[0.875rem] text-ink">
              {u.checks === 0 ? (
                'No checks yet: the first comes within 5 minutes.'
              ) : (
                <>
                  <strong>
                    {(((u.checks - u.failed) / u.checks) * 100).toFixed(u.failed ? 2 : 0)}% up
                  </strong>{' '}
                  ({u.checks} checks, {u.failed} failed)
                  {u.latest
                    ? `. Last: ${u.latest.ok ? 'answered' : 'failed'}${
                        u.latest.ms === null ? '' : ` in ${String(u.latest.ms)} ms`
                      }, ${when(u.latest.at)}.`
                    : ''}
                </>
              )}
            </p>
            <UptimeStrip hours={u.hours} />
            {u.gaps.length > 0 ? (
              <div className="mt-2">
                <p className="font-semibold text-[0.8125rem] text-ink">No checks at all</p>
                <Note>
                  The database or its scheduler was not running, so it could not check. That is
                  Supabase itself down.
                </Note>
                <ul className="mt-1 text-[0.75rem] text-ink2">
                  {u.gaps.map((g) => (
                    <li key={g.from}>
                      {when(g.from)} to {when(g.to)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 font-semibold text-[0.8125rem] text-ink">Alerts</p>
            {u.alerts.length === 0 ? (
              <Note>None in this time.</Note>
            ) : (
              <ul className="mt-1 divide-y divide-line rounded-[12px] border border-line bg-paper text-[0.8125rem]">
                {u.alerts.map((a) => (
                  <li key={`${a.kind}-${a.opened_at}`} className="px-2.5 py-1.5">
                    <span className="font-semibold text-ink">{ALERT_NAMES[a.kind] ?? a.kind}</span>
                    <span className="block text-[0.75rem] text-ink2">
                      {when(a.opened_at)}
                      {a.kind === 'app_down'
                        ? a.closed_at
                          ? ` to ${when(a.closed_at)}`
                          : ', still not answering'
                        : ''}
                      {a.detail ? ` · ${a.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Waiting>
    </div>
  );
}

/** One block an hour: green answered, red some failed, grey no checks. */
function UptimeStrip({ hours }: { hours: Uptime['hours'] }) {
  if (hours.length === 0) return null;
  return (
    <div className="mt-2">
      <div
        className="flex h-6 items-stretch gap-px overflow-hidden rounded-[6px]"
        aria-hidden="true"
      >
        {hours.map((h) => (
          <span
            key={h.hour}
            title={`${when(h.hour)}: ${String(h.checks - h.failed)} of ${String(h.checks)} answered${
              h.p50_ms === null ? '' : `, typically ${String(h.p50_ms)} ms`
            }`}
            className={`min-w-px flex-1 ${h.failed === 0 ? 'bg-emerald-500/80' : h.failed < h.checks ? 'bg-amber-500' : 'bg-destructive'}`}
          />
        ))}
      </div>
      <p className="mt-0.5 flex justify-between text-[0.6875rem] text-grey">
        <span>{when(hours[0]?.hour ?? '')}</span>
        <span>now</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crashes
// ---------------------------------------------------------------------------

interface CrashRow {
  kind: string;
  message: string;
  source: string | null;
  times: number;
  screens: string[] | null;
  releases: string[] | null;
  devices: string[] | null;
  first_at: string;
  last_at: string;
}

const CRASH_KINDS: Record<string, string> = {
  error: 'Error',
  promise: 'Unfinished request',
  render: 'A screen failed to draw',
};

const DEVICE_NAMES: Record<string, string> = {
  iphone: 'iPhone browser',
  'iphone-app': 'iPhone app',
  android: 'Android browser',
  'android-app': 'Android app',
  computer: 'Computer',
  'computer-app': 'Computer app',
};

export function Crashes() {
  const [days, setDays] = useState('7');
  const crashes = useRead(
    () => call<CrashRow[]>('admin_app_errors', { p_days: Number(days) }),
    days,
  );
  return (
    <div>
      <Heading>The app’s crashes</Heading>
      <Note>
        What broke in members’ apps, alike ones counted together, newest first. Never who:
        addresses, ids and numbers are taken out on the phone before it is sent.
      </Note>
      <SegmentPills segments={PERIODS} value={days} onChange={setDays} className="pt-1" />
      <Waiting read={crashes}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="py-2 text-[0.8125rem] text-ink2">No crashes in this time.</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {rows.map((c) => (
                <li key={`${c.kind}|${c.message}|${c.source ?? ''}`} className={CARD}>
                  <p className="flex items-baseline justify-between gap-2 text-[0.75rem]">
                    <span className="font-semibold text-ink2">{CRASH_KINDS[c.kind] ?? c.kind}</span>
                    <span className="font-bold tabular-nums text-ink">
                      {c.times} {c.times === 1 ? 'time' : 'times'}
                    </span>
                  </p>
                  <p className="mt-0.5 break-words font-mono text-[0.75rem] text-ink">
                    {c.message}
                  </p>
                  <p className="mt-1 text-[0.71875rem] text-grey leading-[1.45]">
                    {c.source ? `${c.source} · ` : ''}
                    {(c.screens ?? []).join(', ') || 'no screen'} ·{' '}
                    {(c.devices ?? []).map((d) => DEVICE_NAMES[d] ?? d).join(', ')}
                    <br />
                    Releases {(c.releases ?? []).join(', ') || 'unknown'} · last {when(c.last_at)}
                    {c.first_at !== c.last_at ? `, first ${when(c.first_at)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )
        }
      </Waiting>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent
// ---------------------------------------------------------------------------

interface Deliveries {
  by_outcome: { channel: string; kind: string | null; outcome: string; count: number }[];
  latest: {
    at: string;
    channel: string;
    kind: string | null;
    outcome: string;
    reason: string | null;
    service: string | null;
  }[];
}

const GOOD = new Set(['sent', 'delivered']);

const PUSH_KINDS: Record<string, string> = {
  admin_alert: 'admin alert',
  direct: 'direct message',
  group: 'group message',
  reply: 'reply',
  reply_participant: 'reply in a topic',
};

export function Sent() {
  const [days, setDays] = useState('7');
  const [typed, setTyped] = useState('');
  const [email, setEmail] = useState('');
  const read = useRead(
    () => call<Deliveries>('admin_deliveries', { p_days: Number(days), p_email: email || null }),
    `${days}|${email}`,
  );

  return (
    <div>
      <Heading>What was emailed and pushed</Heading>
      <Note>
        Every notification the club pushed and every email it sent (sign-in codes, invites,
        reminders), and what became of them. Emails are reported by Resend, so a bounce shows here
        with its reason. Addresses are never kept: to check one, type it below.
      </Note>
      <SegmentPills segments={PERIODS} value={days} onChange={setDays} className="pt-1" />
      <form
        className="mt-1 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setEmail(typed.trim());
        }}
      >
        <label className="flex min-w-[14rem] flex-1 flex-col text-[0.75rem] text-ink2">
          Did an email reach…
          <input
            type="email"
            value={typed}
            placeholder="someone@example.com"
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            className="mt-0.5 min-h-11 rounded-[10px] border border-line bg-paper px-2 text-[0.875rem] text-ink"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-full bg-action px-4 font-bold text-[0.8125rem] text-white"
        >
          Look
        </button>
        {email ? (
          <button
            type="button"
            onClick={() => {
              setTyped('');
              setEmail('');
            }}
            className="min-h-11 px-2 font-semibold text-[0.8125rem] text-ink2 underline underline-offset-2"
          >
            Everybody
          </button>
        ) : null}
      </form>
      <Waiting read={read}>
        {(d) => (
          <>
            {email ? null : (
              <>
                <p className="mt-3 font-semibold text-[0.8125rem] text-ink">By kind</p>
                {d.by_outcome.length === 0 ? (
                  <Note>Nothing recorded in this time yet.</Note>
                ) : (
                  <div className="mt-1 overflow-x-auto rounded-[12px] border border-line bg-paper">
                    <table className="w-full text-[0.78125rem]">
                      <tbody>
                        {d.by_outcome.map((r) => (
                          <tr
                            key={`${r.channel}|${r.kind ?? ''}|${r.outcome}`}
                            className="border-line border-t first:border-t-0"
                          >
                            <td className="px-2 py-1.5 text-ink2">
                              {r.channel === 'push' ? 'Push' : 'Email'}
                            </td>
                            <td className="px-2 py-1.5 text-ink">
                              {r.channel === 'push'
                                ? (PUSH_KINDS[r.kind ?? ''] ?? r.kind?.replace(/_/g, ' '))
                                : r.kind}
                            </td>
                            <td
                              className={`px-2 py-1.5 ${GOOD.has(r.outcome) ? 'text-ink2' : 'font-semibold text-destructive'}`}
                            >
                              {r.outcome}
                            </td>
                            <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                              {r.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <p className="mt-3 font-semibold text-[0.8125rem] text-ink">
              {email ? `Emails to ${email}` : 'Latest that did not arrive'}
            </p>
            {d.latest.length === 0 ? (
              <Note>
                {email ? 'No emails to that address in this time.' : 'None: everything arrived.'}
              </Note>
            ) : (
              <ul className="mt-1 divide-y divide-line rounded-[12px] border border-line bg-paper text-[0.8125rem]">
                {d.latest.map((r, i) => (
                  <li key={`${r.at}-${String(i)}`} className="px-2.5 py-1.5">
                    <span
                      className={
                        GOOD.has(r.outcome)
                          ? 'font-semibold text-ink'
                          : 'font-semibold text-destructive'
                      }
                    >
                      {r.outcome}
                    </span>{' '}
                    <span className="text-ink">
                      {r.channel === 'push'
                        ? `push: ${PUSH_KINDS[r.kind ?? ''] ?? r.kind ?? ''}`
                        : r.kind}
                    </span>
                    <span className="block text-[0.71875rem] text-grey">
                      {when(r.at)}
                      {r.service ? ` · ${r.service}` : ''}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Waiting>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

interface Release {
  tag: string;
  built: string;
  sha: string;
  commits: { sha: string; title: string; author: string }[];
}

interface ReleaseSpeed {
  release: string;
  visits: number;
  opening_p50_ms: number | null;
  cards_p50_ms: number | null;
  request_p50_ms: number | null;
  failed: number;
}

function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${String(value)} ms`;
}

export function Releases() {
  const list = useRead(async (): Promise<Read<Release[]>> => {
    try {
      const response = await fetch('/releases');
      const body = (await response.json()) as Release[] | { error: string };
      return Array.isArray(body) ? { ok: true, value: body } : { ok: false, error: body.error };
    } catch (thrown) {
      return { ok: false, error: String(thrown) };
    }
  }, 'releases');
  const speed = useRead(
    () => call<ReleaseSpeed[]>('admin_page_speed_by_release', { days: 30 }),
    'speed',
  );
  const speedOf = new Map((speed?.ok ? speed.value : []).map((s) => [s.release, s]));

  return (
    <div>
      <Heading>Releases</Heading>
      <Note>
        Each time the app went out, what was in it, and how fast phones found it (typical times,
        from page speed). A release that is slower than the one before is the first place to look.
      </Note>
      <Waiting read={list}>
        {(releases) => (
          <ul className="mt-2 space-y-2">
            {releases.map((r) => {
              const s = speedOf.get(r.built);
              return (
                <li key={r.tag} className={CARD}>
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-[0.875rem] text-ink">
                      {when(`${r.built}:00Z`)}
                    </span>
                    <span className="font-mono text-[0.6875rem] text-grey">{r.sha}</span>
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-ink2">
                    {s
                      ? `Opening ${ms(s.opening_p50_ms)} · screens ${ms(s.cards_p50_ms)} · requests ${ms(s.request_p50_ms)} · ${String(s.visits)} visits${s.failed ? ` · ${String(s.failed)} failed` : ''}`
                      : 'No page speed for it yet.'}
                  </p>
                  {r.commits.length > 0 ? (
                    <details className="mt-1 text-[0.75rem]">
                      <summary className="min-h-11 cursor-pointer content-center font-semibold text-ink2">
                        {r.commits.length} {r.commits.length === 1 ? 'change' : 'changes'}
                      </summary>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-ink">
                        {r.commits.map((c) => (
                          <li key={c.sha}>
                            {c.title}
                            {c.author ? <span className="text-grey"> ({c.author})</span> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Waiting>
    </div>
  );
}
