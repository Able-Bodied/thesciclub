import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { chatDayHeading } from '@/lib/chat/time';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import { methodLabel, methodPhrase } from '@/routes/admin/sign-in-methods';
import { DetailRow, Section } from '@/routes/peers/profile-parts';

/**
 * At the foot of a member's page, for the club's administrators only: how the
 * member came, how they sign in, what they use, whether the club can notify
 * them, and how often they come (the owner, 2026-11-18). Nothing new is
 * recorded; admin_member_story (20261118150000) reads what Admin → Stats and
 * Admin → Members already keep, and refuses anyone else.
 */

interface StoryDevice {
  surface: 'browser' | 'home_screen' | 'app';
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  colorScheme: 'light' | 'dark' | null;
  notifications: 'allowed' | 'refused' | 'not_asked' | null;
  appBuilt: string | null;
  seenAt: string;
}

export interface MemberStory {
  joinedAt: string;
  came: {
    way: 'qr' | 'open' | 'organization' | 'member';
    claimedProfile: boolean;
    registered: boolean;
    invitedAt: string | null;
    sentAt: string | null;
    emailOpenedAt: string | null;
    linkOpenedAt: string | null;
    acceptedAt: string | null;
    by: { id: string; name: string | null } | null;
    organization: string | null;
    qrCode: { event: string | null; organization: string | null } | null;
    event: { id: string; title: string } | null;
    note: string | null;
    message: string | null;
  } | null;
  askedForInvite: boolean;
  signIns: {
    signedUpWith: string | null;
    linked: string[];
    count: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  devices: StoryDevice[];
  appLastSeen: string | null;
  notify: { app: number; web: number };
  activeDays: number;
  lastActive: string | null;
  recordedSince: string | null;
}

/** "Sep 13, 2026". */
function longDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Today", "Yesterday", "Monday", "Thu, Nov 6". */
const day = (iso: string) => chatDayHeading(iso);

/** Mid-sentence: "today", "yesterday", "Monday", "Thu, Nov 6". */
function inline(iso: string): string {
  const said = day(iso);
  return said === 'Today' || said === 'Yesterday' ? said.toLowerCase() : said;
}

const plural = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`;

/** One sentence: who or what brought them. */
export function cameSentence(story: MemberStory): React.ReactNode {
  const came = story.came;
  const asked = story.askedForInvite ? ' They had asked for an invite.' : '';
  if (!came) {
    return story.askedForInvite
      ? 'Asked for an invite. No invite is on record.'
      : 'No invite is on record: added by hand, or before invites were kept.';
  }
  const claimed = came.claimedProfile ? ', claiming their directory profile' : '';
  const event = came.event ? (
    <>
      {came.registered ? ' after registering for ' : ' for '}
      <Link to={`/events/${came.event.id}`} className="underline underline-offset-2">
        {came.event.title}
      </Link>
    </>
  ) : null;
  if (came.way === 'open') return `Joined while anybody could join, with no invite.${asked}`;
  if (came.way === 'qr') {
    const from = came.qrCode?.organization ? ` from ${came.qrCode.organization}` : '';
    const at = came.qrCode?.event ? ` at ${came.qrCode.event}` : '';
    return `Scanned a QR code${from}${at}${claimed}.${asked}`;
  }
  if (came.way === 'organization') {
    return (
      <>
        Invited by {came.organization ?? 'an organization'}
        {event}
        {claimed}.{asked}
      </>
    );
  }
  return (
    <>
      Invited by{' '}
      {came.by?.name ? (
        <Link to={`/peers/${came.by.id}`} className="underline underline-offset-2">
          {came.by.name}
        </Link>
      ) : (
        'a member who has since left'
      )}
      {event}
      {claimed}.{asked}
    </>
  );
}

/** "Invited Nov 3 · email opened Nov 3 · link used Nov 4 · joined Nov 4". */
function cameSteps(story: MemberStory): string | null {
  const came = story.came;
  if (!came) return null;
  const steps = [
    (came.sentAt ?? came.invitedAt)
      ? `invited ${inline(came.sentAt ?? came.invitedAt ?? '')}`
      : null,
    came.emailOpenedAt ? `email opened ${inline(came.emailOpenedAt)}` : null,
    came.linkOpenedAt ? `link used ${inline(came.linkOpenedAt)}` : null,
    came.acceptedAt ? `joined ${inline(came.acceptedAt)}` : null,
  ].filter((step): step is string => step !== null);
  if (!steps.length) return null;
  const line = steps.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "The iPhone app", "Home Screen app on iOS", "Chrome 156 on macOS". */
export function deviceName(device: StoryDevice): string {
  const os = device.os ?? 'an unknown system';
  if (device.surface === 'app') {
    return device.os === 'Android' ? 'The Android app' : 'The iPhone app';
  }
  const browser = device.browser
    ? `${device.browser}${device.browserVersion ? ` ${device.browserVersion}` : ''}`
    : 'A browser';
  if (device.surface === 'home_screen') return `Home Screen app (${browser} on ${os})`;
  return `${browser} on ${os}`;
}

function deviceDetails(device: StoryDevice): string {
  const parts = [
    `seen ${inline(device.seenAt)}`,
    device.screenWidth && device.screenHeight
      ? `${String(device.screenWidth)}×${String(device.screenHeight)}`
      : null,
    device.colorScheme ? `${device.colorScheme} mode` : null,
    device.notifications === 'allowed'
      ? 'notifications allowed'
      : device.notifications === 'refused'
        ? 'notifications blocked'
        : device.notifications === 'not_asked'
          ? 'notifications not asked yet'
          : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Whether the club can reach them now, which is more than a permission. */
export function notifySentence(story: MemberStory): string {
  const { app, web } = story.notify;
  if (app + web === 0) {
    return story.devices.some((d) => d.notifications === 'refused')
      ? 'Off. They blocked notifications on a device.'
      : 'Off. No device is signed up for notifications.';
  }
  const on = [
    app ? plural(app, 'iPhone app') : null,
    web ? plural(web, 'browser or Home Screen app', 'browsers or Home Screen apps') : null,
  ].filter(Boolean);
  return `On, for ${on.join(' and ')}.`;
}

export function activeSentence(story: MemberStory): string | null {
  if (!story.recordedSince) return null;
  const since = longDate(story.recordedSince);
  if (story.activeDays === 0) return `No days since counting began on ${since}.`;
  return `${plural(story.activeDays, 'day')} since counting began on ${since}.`;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; story: MemberStory }
  | { status: 'hidden' }
  | { status: 'error'; message: string };

export function AdminMemberStory({ memberId, name }: { memberId: string; name: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      const { data, error } = (await getSupabase()
        .rpc('admin_member_story', { p_member: memberId })
        .abortSignal(controller.signal)) as {
        data: MemberStory | null;
        error: { code?: string; message: string } | null;
      };
      if (controller.signal.aborted) return;
      // Not there yet (a database before 20261118150000) or not an
      // administrator after all: nothing to show, and nothing to say.
      if (error?.code === 'PGRST202' || error?.code === '42501' || (!error && !data)) {
        setState({ status: 'hidden' });
        return;
      }
      if (error) {
        setState({
          status: 'error',
          message: describeError(error, 'Could not load this member’s activity.'),
        });
        return;
      }
      if (!data) return;
      setState({ status: 'ready', story: data });
    })();
    return () => {
      controller.abort();
    };
  }, [memberId]);

  if (state.status === 'hidden') return null;

  return (
    <Section title="For administrators">
      <p className="-mt-1 mb-2.5 flex items-center gap-1.5 text-[0.78125rem] text-grey leading-[1.45]">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 flex-none" />
        Only the club’s administrators see this, not {name} or other members.
      </p>
      {state.status === 'loading' ? (
        <p className="text-[0.8125rem] text-grey">Loading…</p>
      ) : state.status === 'error' ? (
        <p role="alert" className="text-[0.8125rem] text-destructive">
          {state.message}
        </p>
      ) : (
        <StoryCard story={state.story} />
      )}
    </Section>
  );
}

function StoryCard({ story }: { story: MemberStory }) {
  const steps = cameSteps(story);
  const signedUp = story.signIns.signedUpWith;
  const others = story.signIns.linked.filter((m) => m !== signedUp);
  return (
    <div className="flow-root rounded-[17px] border border-line bg-paper px-3.5 py-1">
      <DetailRow
        label="How they came"
        value={
          <>
            {cameSentence(story)}
            {steps ? <span className="mt-1 block text-[0.78125rem] text-grey">{steps}</span> : null}
            {story.came?.message ? (
              <span className="mt-1 block text-[0.78125rem] text-grey">
                Their invite said: “{story.came.message}”
              </span>
            ) : null}
            {story.came?.note ? (
              <span className="mt-1 block text-[0.78125rem] text-grey">
                Note on the invite: {story.came.note}
              </span>
            ) : null}
          </>
        }
      />
      <DetailRow label="Joined" value={longDate(story.joinedAt)} />
      <DetailRow
        label="Signs in with"
        value={
          signedUp || story.signIns.count ? (
            <>
              {signedUp
                ? `Signed up with ${methodPhrase(signedUp)}`
                : 'Signed up before this was kept'}
              {others.length ? `; also ${others.map(methodLabel).join(', ')}` : ''}.
              {story.signIns.count ? (
                <span className="mt-1 block text-[0.78125rem] text-grey">
                  {plural(story.signIns.count, 'sign-in')}
                  {story.signIns.lastAt ? `, the latest ${inline(story.signIns.lastAt)}` : ''}
                </span>
              ) : null}
            </>
          ) : null
        }
      />
      <DetailRow
        label="Uses"
        value={
          story.devices.length ? (
            <ul className="space-y-2">
              {story.devices.map((device) => (
                <li key={`${device.surface}:${device.os ?? ''}:${device.browser ?? ''}`}>
                  {deviceName(device)}
                  <span className="block text-[0.78125rem] text-grey">{deviceDetails(device)}</span>
                </li>
              ))}
            </ul>
          ) : (
            'No device seen yet.'
          )
        }
      />
      <DetailRow label="Notifications" value={notifySentence(story)} />
      <DetailRow
        label="Last active"
        value={story.lastActive ? day(story.lastActive) : 'Not seen since counting began.'}
      />
      <DetailRow label="Days active" value={activeSentence(story)} />
    </div>
  );
}
