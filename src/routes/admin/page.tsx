import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAccount } from '@/lib/account';
import { useAdminReports } from '@/lib/chat/reports';
import { cn } from '@/lib/utils';
import { ReasonField, SmallButton } from '@/routes/admin/controls';
import { InviteForm } from '@/routes/admin/invite-form';
import {
  type AdminInvite,
  type AdminMember,
  addStrike,
  type BlockedNumber,
  blockNumber,
  canRevoke,
  deleteMember,
  fetchAdminMembers,
  fetchBlockedNumbers,
  fetchInvites,
  fetchStrikes,
  inviteState,
  restoreDirectory,
  revokeInvite,
  type Strike,
  setMemberStatus,
  setMemberType,
  unblockNumber,
  vouchedBy as vouchedBy_,
  withdrawnNumbers,
  withdrawStrike,
} from '@/routes/admin/members-admin';
import { ReportsSection } from '@/routes/admin/reports-section';
import { RoomsSection } from '@/routes/admin/rooms-section';
import { MENTOR_ALLOWANCE } from '@/routes/invites/mentor-invites';
import { STRIKE_LIMIT } from '@/routes/me/standing-api';

/**
 * The roster, for an administrator.
 *
 * Deliberately plain. This is a tool for removing an account at speed when
 * somebody reports a problem, not a dashboard — and the club is two dozen
 * people, so a list is the right shape.
 *
 * Destructive actions confirm first and say what will actually happen, because
 * "delete" here means a real person loses their profile. Every refusal shows
 * the database's own sentence rather than a rewritten one: when an action is
 * blocked, the reason matters more than the tone.
 */
export default function AdminPage() {
  const account = useAccount();
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [blocked, setBlocked] = useState<BlockedNumber[]>([]);
  const [tab, setTab] = useState<'members' | 'invites' | 'rooms' | 'reports'>('members');
  // Read here rather than inside the panel, because the tab's own label
  // carries the open count and has to know it before anybody opens the panel.
  // A complaint waiting unseen behind a tab that looks like every other tab is
  // the failure this number exists to prevent.
  const reports = useAdminReports();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Whose membership is waiting on an answer, by member id. Set by the strike
  // that reaches the limit and cleared by whatever the administrator chooses,
  // "Not now" included — it is a question asked at the moment it is owed, not
  // a state the row is stuck in.
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [memberResult, inviteResult, blockedRows, strikeResult] = await Promise.all([
      fetchAdminMembers(),
      fetchInvites(),
      fetchBlockedNumbers(),
      fetchStrikes(),
    ]);
    if (memberResult.ok) setMembers(memberResult.members);
    if (inviteResult.ok) setInvites(inviteResult.invites);
    if (strikeResult.ok) setStrikes(strikeResult.strikes);
    setBlocked(blockedRows);
    const failure = !memberResult.ok
      ? memberResult.error
      : !inviteResult.ok
        ? inviteResult.error
        : null;
    setError(failure);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (account.status === 'member') void load();
  }, [account.status, load]);

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  // Not the permission check — the database refuses either way. This is so an
  // ordinary member sees the club rather than an empty admin screen.
  if (!account.isAdmin) return <Navigate to="/peers" replace />;

  /**
   * Takes an administrator from a report to the row where they can act on the
   * person who wrote it.
   *
   * A navigation and not an action: the strike, the pause and the removal all
   * live on that row, beside the member's other strikes and their status, and
   * a second strike control on a screen showing one message out of context is
   * how somebody gets struck for a sentence rather than for what they have
   * been doing.
   *
   * The scroll waits a frame because the Members panel has not been rendered
   * at the moment the tab changes, so the row it is looking for does not exist
   * yet.
   */
  function goToMember(memberId: string) {
    setTab('members');
    requestAnimationFrame(() => {
      document.getElementById(`member-${memberId}`)?.scrollIntoView({ block: 'center' });
    });
  }

  /**
   * Runs one administrative action and returns nothing.
   *
   * Deliberately not async: these are handed to onClick, which expects void,
   * and an async handler's rejection there goes unhandled — so a dropped
   * connection would leave the row spinning with no error shown. Everything is
   * caught here instead, including a thrown one.
   */
  function act<T extends { ok: boolean; error?: string }>(
    id: string,
    run: () => Promise<T>,
    /**
     * Run after the roster has been reloaded, and only where the action
     * worked. After, so that anything it opens is looking at the counts the
     * action produced rather than the ones from before it.
     */
    after?: (result: T) => void,
  ) {
    setBusyId(id);
    run()
      .then(async (result) => {
        if (!result.ok) {
          setError(result.error ?? 'That did not work.');
          return;
        }
        setError(null);
        await load();
        after?.(result);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  const real = members.filter((m) => !m.isSeed);
  const seeded = members.filter((m) => m.isSeed);
  const pending = invites.filter((i) => i.status === 'pending');
  // Three lists, because "The list" should mean the numbers that are on it.
  // Withdrawn rows used to sit among them and accumulate forever, which is
  // what made deleting them look necessary — they carry who vouched and when,
  // and the partial unique index means they cost nothing where they are.
  const onTheList = invites.filter((i) => i.status !== 'revoked');
  const withdrawn = withdrawnNumbers(
    invites,
    blocked.map((b) => b.phone),
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        {/* The same measure as the list below. Left at the page edge, the
            heading and the tabs sat well to the left of the rows they
            govern on a desktop — the same mismatch fixed on /invites. */}
        <div className="mx-auto w-full max-w-[760px]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-head text-[1.5625rem] text-ink tracking-[-0.02em]">
            Admin
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey">
            {real.length} joined · {seeded.length} from the directory · {pending.length} invite
            {pending.length === 1 ? '' : 's'} waiting
          </p>
          <div className="mt-3 flex gap-[7px]">
            {(['members', 'invites', 'rooms', 'reports'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                }}
                aria-pressed={tab === value}
                data-target="small"
                className={cn(
                  'rounded-full px-3.5 py-[7px] font-semibold text-[0.84375rem] capitalize',
                  tab === value ? 'bg-navy text-white' : 'bg-tint text-ink2',
                )}
              >
                {value}
                {/* A count of zero is not drawn — the rule the room cards and
                    the nav dot already follow. */}
                {value === 'reports' && reports.openCount > 0 ? ` ${reports.openCount}` : ''}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        {error ? (
          <p className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
        {/* A count, not "done": the difference between a restore that put
            four profiles back and one that quietly matched nothing is the
            only thing worth reading here. */}
        {notice ? (
          <p className="mb-3 rounded-[11px] border border-line bg-paper px-3 py-2.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {notice}
          </p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-[0.875rem] text-grey">Loading the roster…</p>
        ) : (
          <div className="mx-auto w-full max-w-[760px]">
            {tab === 'rooms' ? <RoomsSection /> : null}

            {tab === 'reports' ? (
              <ReportsSection
                reports={reports.reports}
                loading={reports.loading}
                error={reports.error}
                reload={reports.reload}
                onGoToMember={goToMember}
              />
            ) : null}

            {tab === 'invites' ? (
              <>
                <Section title="Add to the list" subtitle="Nobody can join without a number on it.">
                  <div className="p-3">
                    <InviteForm
                      onCreated={() => {
                        void load();
                      }}
                    />
                  </div>
                </Section>

                <Section
                  title="The list"
                  subtitle="A number nobody is on can be taken off the list."
                >
                  {onTheList.map((invite) => (
                    <InviteRow
                      key={invite.id}
                      invite={invite}
                      busy={busyId === invite.id}
                      onRevoke={() => {
                        act(invite.id, () => revokeInvite(invite.id));
                      }}
                      onBlock={(reason) => {
                        act(invite.id, () => blockNumber(invite.phone, reason));
                      }}
                    />
                  ))}
                  {onTheList.length === 0 ? (
                    <p className="py-6 text-center text-[0.8125rem] text-grey">
                      Nobody is on the list yet.
                    </p>
                  ) : null}
                </Section>

                {/* Only when there are any. An empty "Withdrawn" heading is a
                    section about nothing on a screen that is mostly lists. */}
                {withdrawn.length > 0 ? (
                  <Section
                    title="Withdrawn"
                    subtitle="Off the list, and free to be invited again. Kept for the record of who vouched."
                  >
                    {withdrawn.map(({ invite, times }) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        times={times}
                        busy={busyId === invite.id}
                        onRevoke={() => {
                          act(invite.id, () => revokeInvite(invite.id));
                        }}
                        onBlock={(reason) => {
                          act(invite.id, () => blockNumber(invite.phone, reason));
                        }}
                      />
                    ))}
                  </Section>
                ) : null}

                {blocked.length > 0 ? (
                  <Section
                    title="Blocked"
                    subtitle="Cannot be invited by anybody, including a mentor, until unblocked."
                  >
                    {blocked.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-extrabold font-head text-[0.90625rem]">
                            {row.phone}
                          </span>
                          <span className="mt-0.5 block text-[0.75rem] text-grey">
                            {row.reason ?? 'No reason recorded'}
                            {row.blockedBy ? ` · blocked by ${row.blockedBy}` : ''}
                          </span>
                        </span>
                        {busyId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-grey" />
                        ) : (
                          <SmallButton
                            onClick={() => {
                              const ok = window.confirm(
                                `Unblock ${row.phone}?\n\nThey can be invited again. It does not bring their profile back — that was deleted when the number was blocked.`,
                              );
                              if (ok) act(row.id, () => unblockNumber(row.phone));
                            }}
                          >
                            Unblock
                          </SmallButton>
                        )}
                      </div>
                    ))}
                  </Section>
                ) : null}
              </>
            ) : null}

            <Section
              title="Joined"
              subtitle="People who signed up. These can be removed."
              hidden={tab !== 'members'}
            >
              {real.map((m) => (
                <Row
                  key={m.id}
                  member={m}
                  busy={busyId === m.id}
                  isSelf={m.id === account.userId}
                  onPause={() => {
                    act(m.id, () => setMemberStatus(m.id, 'suspended'));
                  }}
                  onResume={() => {
                    act(m.id, () => setMemberStatus(m.id, 'active'));
                  }}
                  onToggleMentor={() => {
                    act(m.id, () => setMemberType(m.id, m.type === 'mentor' ? 'peer' : 'mentor'));
                  }}
                  onRemove={(block, reason) => {
                    // Blocking deletes the member as part of blocking, inside
                    // one function, so a dropped connection cannot leave the
                    // number blocked and the person still in the deck.
                    act(m.id, () =>
                      block ? blockNumber(m.phone, reason, m.id) : deleteMember(m.id),
                    );
                  }}
                  onStrike={(reason) => {
                    act(
                      m.id,
                      () => addStrike(m.id, reason),
                      // The strike that reaches the limit is the last one
                      // there is, so it is also the moment the membership
                      // itself has to be answered for. Asked here rather than
                      // left for somebody to notice a red count later.
                      (result) => {
                        if ((result.strikes ?? 0) >= STRIKE_LIMIT) setDeciding(m.id);
                      },
                    );
                  }}
                  strikes={strikes.filter((strike) => strike.memberId === m.id && strike.counts)}
                  onWithdrawStrike={(id, reason) => {
                    act(m.id, () => withdrawStrike(id, reason));
                  }}
                  deciding={deciding === m.id}
                  onCloseDecision={() => {
                    setDeciding(null);
                  }}
                />
              ))}
              {real.length === 0 ? (
                <p className="py-6 text-center text-[0.8125rem] text-grey">
                  Nobody has joined yet.
                </p>
              ) : null}
            </Section>

            <Section
              title="From the directory"
              subtitle="Seeded from NorCal SCI. Pausing one hides it from the deck."
              hidden={tab !== 'members'}
              // Rehearsing the claim flow retires a seeded profile every
              // time — that is what claiming does — so putting the directory
              // back needs to be a button rather than a migration written by
              // hand each time.
              action={
                <SmallButton
                  onClick={() => {
                    const ok = window.confirm(
                      'Restore the directory?\n\nMissing profiles come back and the ones still here are reset to how they shipped, including any you have paused or edited. Members who have joined are not touched.',
                    );
                    if (!ok) return;
                    setBusyId('directory');
                    restoreDirectory()
                      .then(async (result) => {
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        setError(null);
                        // "Set back", not "put back": the count is every row
                        // it touched, most of which were present and reset
                        // rather than missing and re-inserted.
                        setNotice(
                          `Directory restored — ${result.restored} profile${result.restored === 1 ? '' : 's'} set back to how they shipped.`,
                        );
                        await load();
                      })
                      .catch((e: unknown) => {
                        setError(e instanceof Error ? e.message : 'That did not work.');
                      })
                      .finally(() => {
                        setBusyId(null);
                      });
                  }}
                >
                  {busyId === 'directory' ? 'Restoring…' : 'Restore directory'}
                </SmallButton>
              }
            >
              {seeded.map((m) => (
                <Row
                  key={m.id}
                  member={m}
                  busy={busyId === m.id}
                  isSelf={false}
                  onPause={() => {
                    act(m.id, () => setMemberStatus(m.id, 'suspended'));
                  }}
                  onResume={() => {
                    act(m.id, () => setMemberStatus(m.id, 'active'));
                  }}
                  onToggleMentor={() => {
                    act(m.id, () => setMemberType(m.id, m.type === 'mentor' ? 'peer' : 'mentor'));
                  }}
                  onRemove={(block, reason) => {
                    // Blocking deletes the member as part of blocking, inside
                    // one function, so a dropped connection cannot leave the
                    // number blocked and the person still in the deck.
                    act(m.id, () =>
                      block ? blockNumber(m.phone, reason, m.id) : deleteMember(m.id),
                    );
                  }}
                  onStrike={(reason) => {
                    act(
                      m.id,
                      () => addStrike(m.id, reason),
                      // The strike that reaches the limit is the last one
                      // there is, so it is also the moment the membership
                      // itself has to be answered for. Asked here rather than
                      // left for somebody to notice a red count later.
                      (result) => {
                        if ((result.strikes ?? 0) >= STRIKE_LIMIT) setDeciding(m.id);
                      },
                    );
                  }}
                  strikes={strikes.filter((strike) => strike.memberId === m.id && strike.counts)}
                  onWithdrawStrike={(id, reason) => {
                    act(m.id, () => withdrawStrike(id, reason));
                  }}
                  deciding={deciding === m.id}
                  onCloseDecision={() => {
                    setDeciding(null);
                  }}
                />
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  hidden,
  action,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  hidden?: boolean;
  /** A control belonging to the section as a whole rather than to a row. */
  action?: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
          {title}
        </h2>
        {action}
      </div>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">{subtitle}</p>
      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">{children}</div>
    </>
  );
}

function Row({
  member,
  busy,
  isSelf,
  onPause,
  onResume,
  onRemove,
  onToggleMentor,
  onStrike,
  strikes,
  onWithdrawStrike,
  deciding,
  onCloseDecision,
}: {
  member: AdminMember;
  busy: boolean;
  isSelf: boolean;
  onPause: () => void;
  onResume: () => void;
  /** One call either way: blocking deletes the member as part of blocking. */
  onRemove: (block: boolean, reason: string | null) => void;
  onToggleMentor: () => void;
  onStrike: (reason: string) => void;
  /** This member's strikes that still count. Withdrawn and expired ones are not here. */
  strikes: Strike[];
  onWithdrawStrike: (id: string, reason: string) => void;
  /** Whether the strike just issued was the last one, and the membership is owed an answer. */
  deciding: boolean;
  onCloseDecision: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [block, setBlock] = useState(false);
  const [reason, setReason] = useState('');
  const [striking, setStriking] = useState(false);
  const [strikeReason, setStrikeReason] = useState('');
  // Which strike is being withdrawn, by id. A member can be on three, and an
  // administrator withdrawing one is almost always correcting a particular
  // mistake rather than clearing the slate — so they pick which.
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [listingStrikes, setListingStrikes] = useState(false);
  // The database refuses a fourth (20260917000000), so the button that would
  // ask for one is not offered. The count beside the name is already saying
  // why, in red, and it opens the list where the sentence about it lives.
  const atLimit = member.strikes >= STRIKE_LIMIT;

  return (
    <div
      // What "Go to <name>" on a report scrolls to. scroll-mt keeps the row
      // clear of the sticky header it would otherwise land under.
      id={`member-${member.id}`}
      className="flex scroll-mt-4 flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
    >
      {/* A basis rather than a bare flex-1. With only `flex-1` this column
          shrank towards nothing to keep three buttons on one line, so at the
          largest text setting the phone and city wrapped into a four-character
          ribbon underneath them. Given a basis it holds its width and the
          buttons wrap to their own row, which is what `flex-wrap` on the row
          was there for. */}
      <span className="min-w-0 flex-1 basis-[13rem]">
        <span className="block font-extrabold font-head text-[0.90625rem]">
          {member.displayName}
          {member.isAdmin ? (
            <span className="ml-2 rounded-full bg-gold-lt px-2 py-0.5 font-bold text-[0.625rem] text-gold-dp uppercase tracking-wider">
              Admin
            </span>
          ) : null}
          {isSelf ? <span className="ml-2 text-[0.6875rem] text-grey">you</span> : null}
        </span>
        <span className="mt-0.5 block text-[0.75rem] text-grey">
          {member.phone} · {[member.city, member.state].filter(Boolean).join(', ')} ·{' '}
          <span className={cn(member.status !== 'active' && 'font-bold text-destructive')}>
            {member.status}
          </span>
          {/* Only where somebody actually holds invites, or could. Printing
              "0 of 2" against two dozen peers who cannot invite at all would
              bury the one mentor who has spent theirs. A former mentor still
              holding one is why this is not gated on type alone — and a
              seeded row is excluded whatever its type, because nobody can
              sign in as one, so its allowance is not a thing that exists. */}
          {member.strikes > 0 ? (
            <>
              {' · '}
              {/* The count is the way to the strikes themselves. A separate
                  button would be a second thing to find for something the row
                  is already reporting. */}
              <button
                type="button"
                onClick={() => {
                  setListingStrikes((open) => !open);
                }}
                aria-expanded={listingStrikes}
                className="rounded px-0.5 font-bold text-destructive underline decoration-destructive/40 underline-offset-2 transition-colors hover:decoration-destructive"
              >
                {member.strikes === 1 ? '1 strike' : `${member.strikes} strikes`}
              </button>
            </>
          ) : null}
          {member.invitesUsed !== undefined &&
          !member.isSeed &&
          !member.isAdmin &&
          (member.type === 'mentor' || member.invitesUsed > 0) ? (
            <>
              {' '}
              · {member.invitesUsed} of {MENTOR_ALLOWANCE} invites used
            </>
          ) : null}
        </span>
      </span>

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-grey" />
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {/* Nothing at all beside an administrator. Their membership cannot be
              ended from the application and their type is a rule rather than a
              choice — an administrator is a mentor, enforced by a trigger since
              20260916030000 — so every control this row could offer is one the
              database would refuse. A sentence explaining that was worse than
              silence: it put an apology where an action goes, on the row an
              administrator sees every time they open the page. */}
          {member.isAdmin ? null : (
            <>
              <SmallButton onClick={onToggleMentor}>
                {member.type === 'mentor' ? 'Make peer' : 'Make mentor'}
              </SmallButton>
              {/* "Pause" rather than "Suspend", matching the screen the member
                  actually sees. The column still stores 'suspended'; renaming a
                  check constraint and the rows under it is churn for a word
                  nobody outside the schema reads. */}
              {atLimit ? null : (
                <SmallButton
                  onClick={() => {
                    setStriking(true);
                  }}
                >
                  Strike
                </SmallButton>
              )}
              {member.status === 'active' ? (
                <SmallButton onClick={onPause}>Pause</SmallButton>
              ) : (
                <SmallButton onClick={onResume}>Resume</SmallButton>
              )}
              <SmallButton
                destructive
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Remove
              </SmallButton>
            </>
          )}
        </span>
      )}

      {deciding ? (
        /* The question the third strike asks, at the moment it asks it.
           
           Nothing in the database ends a membership — see the header of
           20260916040000, which is unchanged: removing cascades through
           event_rsvps and event_dismissals and would silently destroy a
           member's whole "Been to" record, and the club's shape is that
           membership is taken by a person who can be asked why. So this is a
           prompt and not a consequence, and "Not now" is one of the answers.
           
           What it fixes is the gap between a limit and a decision. The count
           went red on the roster and then waited for somebody to notice it,
           which is exactly the shape of thing that does not get noticed. */
        <Panel
          title={`${member.displayName} is on ${STRIKE_LIMIT} strikes.`}
          buttons={
            <>
              <PanelButton
                onClick={() => {
                  onCloseDecision();
                  onPause();
                }}
              >
                Pause their membership
              </PanelButton>
              <PanelButton
                destructive
                onClick={() => {
                  // Straight into the panel Remove already opens, rather than
                  // a second one asking the same things: the cascade warning
                  // and the "block this number too" tick are the whole of what
                  // removing needs to ask, and a ban is that tick.
                  onCloseDecision();
                  setConfirming(true);
                }}
              >
                Remove them from the club
              </PanelButton>
              <PanelButton onClick={onCloseDecision}>Not now</PanelButton>
            </>
          }
        >
          <p>
            That is the last strike there is — no more can be given. Nothing has happened to their
            membership; that is yours to decide.
          </p>
          <p className="mt-1.5">
            Pausing keeps their profile and their record of what they have been to, and is undone
            with Resume. Removing deletes both, and can also block the number.
          </p>
        </Panel>
      ) : null}

      {listingStrikes && strikes.length > 0 ? (
        <div className="mt-2 w-full rounded-[12px] border border-line bg-canvas p-3">
          <p className="font-extrabold font-head text-[0.84375rem] text-ink">
            {member.displayName}’s strikes
          </p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {strikes.map((strike) => (
              <li key={strike.id} className="flex flex-wrap items-start gap-2">
                <span className="min-w-0 flex-1 basis-[11rem]">
                  <span className="block font-bold text-[0.8125rem] text-ink leading-[1.45]">
                    {strike.reason}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-grey">
                    {new Date(strike.issuedAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {strike.issuedByName ? ` · ${strike.issuedByName}` : ''}
                  </span>
                </span>
                <SmallButton
                  onClick={() => {
                    setWithdrawing(strike.id);
                  }}
                >
                  Withdraw
                </SmallButton>
              </li>
            ))}
          </ul>
          {/* Only the ones that still count are listed. A withdrawn or expired
              strike is on the record and nothing can be done to it, so offering
              a button beside it would be offering nothing. */}
          <p className="mt-2.5 text-[0.75rem] text-grey leading-[1.5]">
            Withdrawing keeps the strike on the record and stops it counting.
            {atLimit
              ? ' They are at the limit — no more can be given. Pause or remove them, or withdraw one.'
              : ''}
          </p>
        </div>
      ) : null}

      {withdrawing ? (
        <ConfirmPanel
          title="Withdraw this strike?"
          confirmLabel="Withdraw it"
          confirmDisabled={withdrawReason.trim().length === 0}
          onCancel={() => {
            setWithdrawing(null);
            setWithdrawReason('');
          }}
          onConfirm={() => {
            const id = withdrawing;
            setWithdrawing(null);
            setWithdrawReason('');
            onWithdrawStrike(id, withdrawReason.trim());
          }}
        >
          <p>
            It stops counting towards three and stays on the record, with your reason beside it.
          </p>
          <label
            className="mt-2 block font-semibold text-[0.75rem] text-ink"
            htmlFor="withdraw-why"
          >
            Why are you withdrawing it?
          </label>
          <input
            id="withdraw-why"
            value={withdrawReason}
            onChange={(e) => {
              setWithdrawReason(e.target.value);
            }}
            placeholder="Wrong member — meant somebody else"
            className="mt-1 w-full rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[0.8125rem] outline-none focus:border-navy"
          />
        </ConfirmPanel>
      ) : null}

      {striking ? (
        /* The same in-row panel Remove uses, for the same reason: the question
           and the answer stay where the member's name is. The reason is
           required here rather than optional — the database refuses an empty
           one, and a strike somebody cannot read the cause of is unanswerable,
           which is the whole point of writing it down. */
        <ConfirmPanel
          title={`Give ${member.displayName} a strike?`}
          confirmLabel="Give the strike"
          confirmDisabled={strikeReason.trim().length === 0}
          onCancel={() => {
            setStriking(false);
            setStrikeReason('');
          }}
          onConfirm={() => {
            setStriking(false);
            onStrike(strikeReason.trim());
            setStrikeReason('');
          }}
        >
          <p>
            They will see this on Me, with the date. It stops counting after a year, and it can be
            withdrawn.
          </p>
          <label className="mt-2 block font-semibold text-[0.75rem] text-ink" htmlFor="strike-why">
            What happened?
          </label>
          <input
            id="strike-why"
            value={strikeReason}
            onChange={(e) => {
              setStrikeReason(e.target.value);
            }}
            placeholder="Sold supplements in a room"
            className="mt-1 w-full rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[0.8125rem] outline-none focus:border-navy"
          />
        </ConfirmPanel>
      ) : null}

      {confirming ? (
        <ConfirmPanel
          title={`Remove ${member.displayName} from the club?`}
          // "Remove them", not "Remove": the button that opens this panel is
          // now called Remove too, and a confirm button that repeats the name
          // of the one you just pressed does not say what pressing it does.
          confirmLabel={block ? 'Remove and block' : 'Remove them'}
          onCancel={() => {
            setConfirming(false);
            setBlock(false);
            setReason('');
          }}
          onConfirm={() => {
            setConfirming(false);
            onRemove(block, reason.trim() || null);
          }}
        >
          {/* The cascade is named because it is the part nobody expects.
              event_rsvps, event_dismissals, organization_follows and
              member_strikes are all `on delete cascade` on member_id, so
              removing somebody takes their whole record of what they went to
              and who they followed — and rejoining on the same number does not
              bring it back, because it is a new row. That was found the way
              these things are: by removing an account to test the button and
              watching Been to empty itself. */}
          <p>
            Their profile is deleted and their invite is revoked. Everything they said they were
            going to, the organizations they follow and any strikes on their record go with it —
            rejoining later starts them from nothing. Their sign-in still exists but shows them
            nothing.
          </p>
          {/* And the half that does not go, which is the owner's decision of
              2026-09-18 and the opposite of what the paragraph above trains an
              administrator to expect. Every author column in Chat is
              `on delete set null`, so a post keeps its words and its place in
              the numbering and loses its name. Said here because this is the
              moment somebody is deciding, and finding out afterwards that a
              removed member's words are still in a room reads as a bug rather
              than as a choice.

              chat-member-removed.sql is the proof of both halves. */}
          <p className="mt-2">
            What they wrote in the discussion rooms and in conversations stays where it is, without
            their name on it. Nobody else's copy of a conversation is deleted by somebody leaving
            it.
          </p>
          {/* The one question worth asking at this moment, and the only thing
              separating this from a ban. Left unticked, the number is free
              and anybody can invite them back tomorrow.

              Offered on every row, directory ones included. It was hidden on
              those on the grounds that nobody has ever signed in as a seeded
              row, so there is no conduct to answer for — but the number on a
              seeded row is still a real person's, and if they should not be
              in the club then blocking it is exactly the thing an
              administrator needs. Twenty-two of the rows on this tab are
              seeded, so the option was missing from most of them, which
              reads as broken rather than as considered. */}
          <label
            htmlFor={`block-${member.id}`}
            className="mt-2.5 flex cursor-pointer items-start gap-2"
          >
            <input
              id={`block-${member.id}`}
              type="checkbox"
              checked={block}
              onChange={(e) => {
                setBlock(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 flex-none accent-[var(--destructive)]"
            />
            <span>
              <span className="block font-bold text-ink">Block this number too</span>
              <span className="block text-grey">
                Nobody — no organization and no mentor — can put it back on the list until an
                administrator unblocks it.
              </span>
            </span>
          </label>
          {block ? (
            <ReasonField id={`reason-${member.id}`} value={reason} onChange={setReason} />
          ) : null}
        </ConfirmPanel>
      ) : null}
    </div>
  );
}

/**
 * The confirmation, in the row rather than in a native dialog.
 *
 * Removing somebody asks two questions at once — are you sure, and can they
 * come back — and `window.confirm` can only ask one. Stacking two dialogs to
 * get the second answer made the more serious action the one with more
 * clicking, which is not the same as the one with more thought. Here the
 * question that matters is a checkbox the administrator reads before the
 * button they press changes its own name.
 */
function ConfirmPanel({
  title,
  children,
  confirmLabel,
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  /** For a panel whose answer is not complete yet — a strike with no reason. */
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Panel
      title={title}
      buttons={
        <>
          <PanelButton onClick={onCancel}>Cancel</PanelButton>
          <PanelButton destructive disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </PanelButton>
        </>
      }
    >
      {children}
    </Panel>
  );
}

/**
 * The shell both in-row panels share.
 *
 * Separated from ConfirmPanel when the third strike gained a panel that asks
 * which of two things to do rather than whether to do one — Pause, Remove and
 * Not now do not fit a confirm and a cancel. The shell is the part that has to
 * stay identical: same width, same tint, same place in the row, so a panel that
 * opens under a name always looks like the same kind of thing.
 */
function Panel({
  title,
  children,
  buttons,
}: {
  title: string;
  children: React.ReactNode;
  buttons: React.ReactNode;
}) {
  return (
    <div className="mt-2 w-full rounded-[12px] border border-destructive/30 bg-destructive/5 p-3">
      <p className="font-extrabold font-head text-[0.84375rem] text-ink">{title}</p>
      <div className="mt-1.5 text-[0.78125rem] text-ink2 leading-[1.5]">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2">{buttons}</div>
    </div>
  );
}

function PanelButton({
  children,
  destructive = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-h-[38px] rounded-full px-3.5 text-[0.78125rem] transition-colors',
        destructive
          ? 'bg-destructive font-bold font-head text-white hover:bg-destructive/85 disabled:opacity-40 disabled:hover:bg-destructive'
          : 'bg-tint font-semibold text-navy hover:bg-line disabled:opacity-40 disabled:hover:bg-tint',
      )}
    >
      {children}
    </button>
  );
}

function InviteRow({
  invite,
  times = 1,
  busy,
  onRevoke,
  onBlock,
}: {
  invite: AdminInvite;
  /** How many times this number has been invited and withdrawn. */
  times?: number;
  busy: boolean;
  onRevoke: () => void;
  onBlock: (reason: string | null) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const vouchedBy = vouchedBy_(invite);
  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0">
      {/* A basis rather than a bare flex-1. With only `flex-1` this column
          shrank towards nothing to keep three buttons on one line, so at the
          largest text setting the phone and city wrapped into a four-character
          ribbon underneath them. Given a basis it holds its width and the
          buttons wrap to their own row, which is what `flex-wrap` on the row
          was there for. */}
      <span className="min-w-0 flex-1 basis-[13rem]">
        <span className="block font-extrabold font-head text-[0.90625rem]">
          {invite.phone}
          {invite.claimableName ? (
            <span className="ml-2 rounded-full bg-tint px-2 py-0.5 font-bold text-[0.625rem] text-navy">
              claims {invite.claimableName}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[0.75rem] text-grey">
          {vouchedBy} ·{' '}
          <span
            className={cn(
              // A member is on it: the healthy case, and the only one worth
              // weight. An invite backing nobody reads like the rest of the
              // list rather than like an alarm — it is not a problem, it is a
              // number somebody can put back on the list.
              invite.status === 'consumed' && invite.heldBy !== null && 'font-bold text-navy',
              invite.status === 'revoked' && 'text-destructive',
              // Somebody tried and stopped. The only row on this list that
              // asks the reader to do something about it.
              invite.status === 'pending' && invite.hasAccount === true && 'font-bold text-gold-dp',
            )}
          >
            {inviteState(invite)}
          </span>
          {invite.note ? ` · ${invite.note}` : ''}
          {/* A number that keeps coming back is worth seeing as a number
              rather than as five rows that look like a bug. */}
          {times > 1 ? ` · withdrawn ${times} times` : ''}
        </span>
      </span>

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-grey" />
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {canRevoke(invite) ? (
            <SmallButton
              destructive
              onClick={() => {
                const ok = window.confirm(
                  `Take ${invite.phone} off the list?\n\nThey will not be able to join. The number can be added again later.`,
                );
                if (ok) onRevoke();
              }}
            >
              Revoke
            </SmallButton>
          ) : null}
          {/* Offered on every row, including one already revoked and one a
              member is on. Revoke asks "is this number on the list"; Block
              asks "should this number ever be", and those have different
              answers — a withdrawn invite is exactly where somebody decides
              the answer is never. */}
          <SmallButton
            destructive
            onClick={() => {
              setConfirming(true);
            }}
          >
            Block…
          </SmallButton>
        </span>
      )}

      {confirming ? (
        <ConfirmPanel
          title={`Block ${invite.phone}?`}
          confirmLabel="Block"
          onCancel={() => {
            setConfirming(false);
            setReason('');
          }}
          onConfirm={() => {
            setConfirming(false);
            onBlock(reason.trim() || null);
          }}
        >
          <p>
            Nobody — no organization and no mentor — can put this number on the list until an
            administrator unblocks it.
            {invite.heldBy ? ` ${invite.heldBy}'s profile is deleted with it.` : ''}
          </p>
          <ReasonField id={`reason-invite-${invite.id}`} value={reason} onChange={setReason} />
        </ConfirmPanel>
      ) : null}
    </div>
  );
}
