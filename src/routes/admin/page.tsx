import { ChevronDown, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { PageTabs, TabPanel, useTabParam } from '@/components/page-tabs';
import { SegmentPills } from '@/components/segment-pills';
import { useAccount } from '@/lib/account';
import { looksLikeEmail } from '@/lib/auth-email';
import { useAdminReports } from '@/lib/chat/reports';
import {
  fetchPartnerTitles,
  forgetPartnerTitles,
  PARTNER_ROLE_NAME,
  type PartnerTitles,
} from '@/lib/club-partners';
import { describeThrown } from '@/lib/describe-error';
import { useJoiningSetting } from '@/lib/joining';
import { cn } from '@/lib/utils';
import { ReasonField, SmallButton } from '@/routes/admin/controls';
import { EventContactsSection } from '@/routes/admin/event-contacts-section';
import { InviteForm } from '@/routes/admin/invite-form';
import { JoinTally } from '@/routes/admin/join-tally';
import { JoiningSection } from '@/routes/admin/joining-section';
import {
  type AdminInvite,
  type AdminMember,
  addStrike,
  type BlockedEmail,
  blockEmail,
  canRevoke,
  deleteMember,
  deliveryNote,
  fetchBlockedEmails,
  fetchInvites,
  fetchInvitingOrganizations,
  fetchMemberCounts,
  fetchMemberPage,
  fetchMemberReach,
  fetchStrikes,
  type InvitingOrganization,
  inviteLabel,
  inviteState,
  isOldPhoneInvite,
  joinTally,
  type MemberReach,
  ROSTER_PAGE,
  type RosterCounts,
  reinviteByEmail,
  removeAndBlock,
  removePartner,
  resendInvite,
  revokeInvite,
  type Strike,
  setMemberStatus,
  setMemberType,
  setPartner,
  unblockEmail,
  vouchedBy as vouchedBy_,
  withdrawnInvites,
  withdrawStrike,
} from '@/routes/admin/members-admin';
import { OrganizationsSection } from '@/routes/admin/organizations-section';
import { renewalsDue, useRenewals } from '@/routes/admin/renewals';
import { ReportsSection } from '@/routes/admin/reports-section';
import { RepresentativesSection } from '@/routes/admin/representatives-section';
import { RoomsSection } from '@/routes/admin/rooms-section';
import { todayIso, useAppleHealth } from '@/routes/admin/sign-in-health';
import { SignInSection } from '@/routes/admin/sign-in-section';
import { StatsSection } from '@/routes/admin/stats-section';
import { MENTOR_ALLOWANCE } from '@/routes/invites/mentor-invites';
import { STRIKE_LIMIT } from '@/routes/me/standing-api';

const ADMIN_TAB_VALUES = [
  'members',
  'reports',
  'invites',
  'going',
  'organizations',
  'rooms',
  'sign-in',
  'stats',
] as const;

type MemberFilter = 'all' | 'joined' | 'directory' | 'attention';

/** Wide enough for the form beside the list on a desktop; a phone is narrower anyway. */
const ADMIN_MEASURE = 'max-w-[960px]';

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
  const [search, setSearch] = useState('');
  // The rows read so far: the database searches and pages (20261029230000).
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [found, setFound] = useState(0);
  const [counts, setCounts] = useState<RosterCounts>({
    everyone: 0,
    joined: 0,
    directory: 0,
    attention: 0,
  });
  // What the search box asks, a moment after typing stops.
  const [asked, setAsked] = useState('');
  // One member, from a report's "go to member".
  const [only, setOnly] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [blocked, setBlocked] = useState<BlockedEmail[]>([]);
  const [organizationRevision, setOrganizationRevision] = useState(0);
  const [inviters, setInviters] = useState<InvitingOrganization[]>([]);
  const [tab, setTab] = useTabParam(ADMIN_TAB_VALUES, 'members');
  // Read here, not in the panel, so the tab itself can say what needs
  // renewing: the reminder an administrator sees without opening it. Apple
  // switched off counts too; its date is in the list.
  const apple = useAppleHealth();
  const renewals = useRenewals();
  const toRenew =
    renewalsDue(renewals.renewals, todayIso()) + (apple.health?.enabled === false ? 1 : 0);
  const reloadApple = apple.reload;
  const reloadRenewals = renewals.reload;
  const onRenewed = useCallback(() => {
    reloadApple();
    reloadRenewals();
  }, [reloadApple, reloadRenewals]);
  const [filter, setFilter] = useState<MemberFilter>('all');
  // One row open at a time. Every row carrying all seven of its controls made
  // the roster six phone screens long, to find one person; closed, each is a
  // name and a line, and the controls are a tap on the row you mean.
  const [openMember, setOpenMember] = useState<string | null>(null);
  // Read here rather than inside the panel, because the tab's own label
  // carries the open count and has to know it before anybody opens the panel.
  // A complaint waiting unseen behind a tab that looks like every other tab is
  // the failure this number exists to prevent.
  const reports = useAdminReports();
  // Here and not in the section: the invite form's own sentence depends on it.
  const joining = useJoiningSetting();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Whose membership is waiting on an answer, by member id. Set by the strike
  // that reaches the limit and cleared by whatever the administrator chooses,
  // "Not now" included — it is a question asked at the moment it is owed, not
  // a state the row is stuck in.
  const [deciding, setDeciding] = useState<string | null>(null);
  const [reach, setReach] = useState<Map<string, MemberReach> | null>(null);
  const [partners, setPartners] = useState<PartnerTitles>(new Map());

  // The roster's question now, and how many rows are drawn, so a reload after
  // an action reads the same rows and an answer to an older question is
  // dropped.
  const rosterAsk = useRef<{ query: string; filter: MemberFilter; only: string | null }>({
    query: '',
    filter: 'all',
    only: null,
  });
  const shown = useRef(0);
  const readRoster = useCallback(async (limit: number) => {
    const ask = rosterAsk.current;
    const result = await fetchMemberPage({
      query: ask.only ? '' : ask.query,
      filter: ask.only ? 'all' : ask.filter,
      memberId: ask.only,
      limit,
    });
    if (rosterAsk.current !== ask) return null;
    if (result.ok) {
      shown.current = result.members.length;
      setMembers(result.members);
      setFound(result.total);
      return null;
    }
    return result.error;
  }, []);

  const load = useCallback(async () => {
    // Read fresh: a title may have just changed.
    forgetPartnerTitles();
    const [
      rosterError,
      countResult,
      inviteResult,
      blockedRows,
      strikeResult,
      reachResult,
      partnerTitles,
    ] = await Promise.all([
      readRoster(Math.max(shown.current, ROSTER_PAGE)),
      fetchMemberCounts(),
      fetchInvites(),
      fetchBlockedEmails(),
      fetchStrikes(),
      fetchMemberReach(),
      fetchPartnerTitles(),
    ]);
    if (countResult.ok) setCounts(countResult.counts);
    setReach(reachResult);
    setPartners(partnerTitles);
    if (inviteResult.ok) setInvites(inviteResult.invites);
    if (strikeResult.ok) setStrikes(strikeResult.strikes);
    setBlocked(blockedRows);
    const failure =
      rosterError ??
      (!countResult.ok ? countResult.error : !inviteResult.ok ? inviteResult.error : null);
    setError(failure);
    setLoading(false);
  }, [readRoster]);

  // Typing settles for a moment before the database is asked.
  useEffect(() => {
    const wait = setTimeout(() => {
      setAsked(search.trim());
    }, 250);
    return () => {
      clearTimeout(wait);
    };
  }, [search]);

  // A new question reads the first page again; the first one is load's.
  const asking = useRef(false);
  useEffect(() => {
    rosterAsk.current = { query: asked, filter, only };
    if (!asking.current) {
      asking.current = true;
      return;
    }
    void readRoster(ROSTER_PAGE).then((failure) => {
      if (failure) setError(failure);
    });
  }, [asked, filter, only, readRoster]);

  // A report's member, once their row is drawn.
  useEffect(() => {
    const row =
      only && members.some((m) => m.id === only) ? document.getElementById(`member-${only}`) : null;
    // jsdom has no scrollIntoView.
    if (row && 'scrollIntoView' in row) row.scrollIntoView({ block: 'center' });
  }, [only, members]);

  function showMore() {
    const ask = rosterAsk.current;
    setMore(true);
    fetchMemberPage({
      query: ask.query,
      filter: ask.filter,
      offset: members.length,
    })
      .then((result) => {
        if (rosterAsk.current !== ask) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMembers((rows) => {
          const next = [...rows, ...result.members.filter((m) => !rows.some((r) => r.id === m.id))];
          shown.current = next.length;
          return next;
        });
        setFound(result.total);
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Could not load more members.'));
      })
      .finally(() => {
        setMore(false);
      });
  }

  useEffect(() => {
    if (account.status === 'member') {
      void load();
      void fetchInvitingOrganizations().then(setInviters);
    }
  }, [account.status, load]);

  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  // Not the permission check — the database refuses either way. This is so an
  // ordinary member sees the club rather than an empty admin screen.
  if (!account.isAdmin) return <Navigate to="/home" replace />;

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
    setSearch('');
    setAsked('');
    setFilter('all');
    setOnly(memberId);
    setOpenMember(memberId);
    setTab('members');
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
        setError(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  // The database found these (searched and filtered); here they are only
  // split into who joined and the directory.
  const query = only ? '' : asked;
  const real = members.filter((m) => !m.isSeed);
  const seeded = members.filter((m) => m.isSeed);
  const showJoined = filter !== 'directory';
  const showDirectory = filter === 'all' || filter === 'directory';
  const joinedCount = counts.joined;
  // Zero on the live club since 20261010020000; the directory's filter,
  // section and count are drawn only where there are seeded rows (a local
  // database still has them).
  const directoryCount = counts.directory;
  const attentionCount = counts.attention;
  const pending = invites.filter((i) => i.status === 'pending');
  // Three lists, because "The list" should mean the people who are on it.
  // Withdrawn rows used to sit among them and accumulate forever, which is
  // what made deleting them look necessary — they carry who vouched and when,
  // and the partial unique index means they cost nothing where they are.
  const onTheList = invites.filter((i) => i.status !== 'revoked');
  const withdrawn = withdrawnInvites(
    invites,
    blocked.map((b) => b.email),
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none bg-paper px-[18px] pt-[18px] pb-3">
        {/* The same measure as the panels below, so the heading and the tabs
            line up with the rows they govern on a desktop. */}
        <div className={cn('mx-auto w-full', ADMIN_MEASURE)}>
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Admin
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey">
            {joinedCount} joined ·{' '}
            {directoryCount > 0 ? `${directoryCount} from the directory · ` : ''}
            {pending.length} invite
            {pending.length === 1 ? '' : 's'} waiting
          </p>
        </div>
      </header>
      {/* Out of the header so it can stick: on a long roster or a long list
          of reports the other tabs stay one tap away. Ordered by what an
          administrator comes here to do, so Reports and its count are on
          screen on the narrowest phone. */}
      <PageTabs
        id="admin"
        label="Admin sections"
        measure={ADMIN_MEASURE}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'members', label: 'Members' },
          { value: 'reports', label: 'Reports', count: reports.openCount, countLabel: 'waiting' },
          { value: 'invites', label: 'Invites' },
          { value: 'going', label: 'Going' },
          { value: 'organizations', label: 'Organizations' },
          { value: 'rooms', label: 'Rooms' },
          {
            // The value stays: old ?tab=sign-in links still land here.
            value: 'sign-in',
            label: 'Keys & renewals',
            count: toRenew,
            countLabel: 'to renew',
          },
          { value: 'stats', label: 'Stats' },
        ]}
      />

      <div className={cn('mx-auto w-full flex-none px-4 pt-3.5 pb-8', ADMIN_MEASURE)}>
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="py-10 text-center text-[0.875rem] text-grey">Loading the roster…</p>
        ) : (
          <TabPanel id="admin" value={tab}>
            {tab === 'members' ? (
              <div className="rounded-[14px] border border-line bg-paper p-3.5">
                <label
                  htmlFor="admin-member-search"
                  className="block font-bold font-head text-[0.875rem] text-ink"
                >
                  Find a member
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    id="admin-member-search"
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setOnly(null);
                    }}
                    placeholder="Name, email, @username, location or account type"
                    className="min-h-[44px] min-w-0 flex-1 basis-[14rem] rounded-[10px] border border-line bg-canvas px-3 text-[0.875rem] text-ink outline-none focus:border-emphasis"
                  />
                  {search ? (
                    <SmallButton
                      onClick={() => {
                        setSearch('');
                      }}
                    >
                      Clear search
                    </SmallButton>
                  ) : null}
                </div>
                {query ? (
                  <p role="status" className="mt-2 text-[0.8125rem] text-grey">
                    {found} matching member{found === 1 ? '' : 's'}
                  </p>
                ) : null}
                {only ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-grey">
                    Showing the member from the report.
                    <SmallButton
                      onClick={() => {
                        setOnly(null);
                      }}
                    >
                      Show everyone
                    </SmallButton>
                  </p>
                ) : null}
                {/* Which part of the roster, beside the search rather than as
                    two sections to scroll between: the directory is twenty-odd
                    rows nobody signs in as, and it sat between an administrator
                    and the bottom of every search. */}
                <SegmentPills
                  className="mt-1 pb-0"
                  value={filter}
                  onChange={(next) => {
                    setFilter(next);
                    setOnly(null);
                  }}
                  segments={
                    directoryCount > 0
                      ? [
                          ['all', `All · ${counts.everyone}`],
                          ['joined', `Joined · ${joinedCount}`],
                          ['directory', `Directory · ${directoryCount}`],
                          ['attention', `Paused or struck · ${attentionCount}`],
                        ]
                      : [
                          ['all', `All · ${counts.everyone}`],
                          ['attention', `Paused or struck · ${attentionCount}`],
                        ]
                  }
                />
              </div>
            ) : null}

            {tab === 'going' ? <EventContactsSection /> : null}
            {tab === 'rooms' ? <RoomsSection /> : null}
            {tab === 'stats' ? <StatsSection /> : null}
            {tab === 'sign-in' ? (
              <SignInSection health={apple.health} renewals={renewals} onRenewed={onRenewed} />
            ) : null}

            {tab === 'organizations' ? (
              // Side by side on a desktop: the directory is long, and linking
              // a member to one of its entries was below all of it.
              <div className="grid items-start gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                <div className="min-w-0">
                  <OrganizationsSection
                    onChange={() => {
                      setOrganizationRevision((value) => value + 1);
                    }}
                  />
                </div>
                <div className="min-w-0 lg:sticky lg:top-[4.5rem]">
                  <RepresentativesSection key={organizationRevision} />
                </div>
              </div>
            ) : null}

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
              // The form beside the list on a desktop, and held in view while
              // the list scrolls: adding a number and checking the list for it
              // are done together.
              <div className="grid items-start gap-x-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <div className="min-w-0 lg:sticky lg:top-[4.5rem]">
                  <JoiningSection
                    setting={joining.setting}
                    error={joining.error}
                    onChanged={joining.reload}
                  />
                  <Section
                    title="Add to the list"
                    subtitle={
                      joining.setting?.open
                        ? 'Anybody can join right now, but an invite still sends somebody the link. Add an email address and the club sends it.'
                        : 'Nobody can join without an invite. Add an email address and the club sends the link.'
                    }
                  >
                    <div className="p-3">
                      <InviteForm
                        onCreated={() => {
                          void load();
                        }}
                      />
                    </div>
                  </Section>
                </div>
                <div className="min-w-0">
                  <JoinTally rows={joinTally(invites)} />
                  <Section
                    title="The list"
                    subtitle="An invite nobody has used can be taken off the list, or its link sent again."
                  >
                    {onTheList.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        busy={busyId === invite.id}
                        onRevoke={() => {
                          act(invite.id, () => revokeInvite(invite.id));
                        }}
                        onResend={() => {
                          act(invite.id, () => resendInvite(invite.id));
                        }}
                        onReinvite={(email) => {
                          act(invite.id, () => reinviteByEmail(invite, email, inviters));
                        }}
                        onBlock={(reason) => {
                          if (invite.email)
                            act(invite.id, () => blockEmail(invite.email ?? '', reason));
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
                          onResend={() => {
                            act(invite.id, () => resendInvite(invite.id));
                          }}
                          onReinvite={(email) => {
                            act(invite.id, () => reinviteByEmail(invite, email, inviters));
                          }}
                          onBlock={(reason) => {
                            if (invite.email)
                              act(invite.id, () => blockEmail(invite.email ?? '', reason));
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
                          key={row.email}
                          className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-extrabold font-head text-[0.90625rem]">
                              {row.email}
                            </span>
                            <span className="mt-0.5 block text-[0.75rem] text-grey">
                              {row.reason ?? 'No reason recorded'}
                              {row.blockedBy ? ` · blocked by ${row.blockedBy}` : ''}
                            </span>
                          </span>
                          {busyId === row.email ? (
                            <Loader2 className="h-4 w-4 animate-spin text-grey" />
                          ) : (
                            <SmallButton
                              onClick={() => {
                                const ok = window.confirm(
                                  `Unblock ${row.email}?\n\nThey can be invited again. It does not bring back a profile that was deleted when they were removed.`,
                                );
                                if (ok) act(row.email, () => unblockEmail(row.email));
                              }}
                            >
                              Unblock
                            </SmallButton>
                          )}
                        </div>
                      ))}
                    </Section>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Section
              title="Joined"
              subtitle="Manage account types and membership for people who signed up."
              hidden={tab !== 'members' || !showJoined}
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
                  onMakeOrganization={() => {
                    act(m.id, () => setMemberType(m.id, 'organization'));
                  }}
                  onToggleMentor={() => {
                    act(m.id, () => setMemberType(m.id, m.type === 'peer' ? 'mentor' : 'peer'));
                  }}
                  partnerTitle={partners.get(m.id) ?? null}
                  onSetPartner={(title) => {
                    act(m.id, () => setPartner(m.id, title));
                  }}
                  onRemovePartner={() => {
                    act(m.id, () => removePartner(m.id));
                  }}
                  onRemove={(block, reason) => {
                    // Blocks the address first, then removes: see
                    // removeAndBlock for why that order.
                    act(m.id, () => (block ? removeAndBlock(m, reason) : deleteMember(m.id)));
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
                  reach={reach?.get(m.id)}
                  onWithdrawStrike={(id, reason) => {
                    act(m.id, () => withdrawStrike(id, reason));
                  }}
                  deciding={deciding === m.id}
                  onCloseDecision={() => {
                    setDeciding(null);
                  }}
                  expanded={openMember === m.id}
                  onToggle={() => {
                    setOpenMember((open) => (open === m.id ? null : m.id));
                  }}
                />
              ))}
              {real.length === 0 ? (
                <p className="py-6 text-center text-[0.8125rem] text-grey">
                  {query
                    ? 'No joined members match your search.'
                    : filter === 'attention'
                      ? 'Nobody is paused or on a strike.'
                      : 'Nobody has joined yet.'}
                </p>
              ) : null}
            </Section>

            <Section
              title="From the directory"
              subtitle="Seeded from NorCal SCI. Pausing one hides it from the deck."
              hidden={tab !== 'members' || !showDirectory || directoryCount === 0}
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
                  onMakeOrganization={() => {
                    act(m.id, () => setMemberType(m.id, 'organization'));
                  }}
                  onToggleMentor={() => {
                    act(m.id, () => setMemberType(m.id, m.type === 'peer' ? 'mentor' : 'peer'));
                  }}
                  onRemove={(block, reason) => {
                    // Blocks the address first, then removes: see
                    // removeAndBlock for why that order.
                    act(m.id, () => (block ? removeAndBlock(m, reason) : deleteMember(m.id)));
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
                  reach={reach?.get(m.id)}
                  onWithdrawStrike={(id, reason) => {
                    act(m.id, () => withdrawStrike(id, reason));
                  }}
                  deciding={deciding === m.id}
                  onCloseDecision={() => {
                    setDeciding(null);
                  }}
                  expanded={openMember === m.id}
                  onToggle={() => {
                    setOpenMember((open) => (open === m.id ? null : m.id));
                  }}
                />
              ))}
            </Section>

            {tab === 'members' && !only && members.length < found ? (
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <p className="text-[0.8125rem] text-grey">
                  Showing {members.length} of {found}
                </p>
                <SmallButton onClick={showMore} disabled={more}>
                  {more ? 'Loading…' : `Show ${Math.min(ROSTER_PAGE, found - members.length)} more`}
                </SmallButton>
              </div>
            ) : null}
          </TabPanel>
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
  onMakeOrganization,
  partnerTitle,
  onSetPartner,
  onRemovePartner,
  onStrike,
  strikes,
  reach,
  onWithdrawStrike,
  deciding,
  onCloseDecision,
  expanded,
  onToggle,
}: {
  member: AdminMember;
  busy: boolean;
  isSelf: boolean;
  onPause: () => void;
  onResume: () => void;
  /** One call either way: blocking deletes the member as part of blocking. */
  onRemove: (block: boolean, reason: string | null) => void;
  onToggleMentor: () => void;
  onMakeOrganization: () => void;
  /** Their title as a trusted partner, or null. Left out where nobody can be one: a seeded row. */
  partnerTitle?: string | null;
  onSetPartner?: (title: string) => void;
  onRemovePartner?: () => void;
  onStrike: (reason: string) => void;
  /** This member's strikes that still count. Withdrawn and expired ones are not here. */
  strikes: Strike[];
  /** Notifications and the Home Screen app; absent when not known. */
  reach?: MemberReach | undefined;
  onWithdrawStrike: (id: string, reason: string) => void;
  /** Whether the strike just issued was the last one, and the membership is owed an answer. */
  deciding: boolean;
  onCloseDecision: () => void;
  /** Whether this row's controls are showing. */
  expanded: boolean;
  onToggle: () => void;
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
  // The title being written, while that panel is open.
  const [partnering, setPartnering] = useState<string | null>(null);
  const [unpartnering, setUnpartnering] = useState(false);
  // The database refuses a fourth (20260917000000), so the button that would
  // ask for one is not offered. The count beside the name is already saying
  // why, in red, and it opens the list where the sentence about it lives.
  const atLimit = member.strikes >= STRIKE_LIMIT;

  return (
    <div
      // What "Go to <name>" on a report scrolls to.
      id={`member-${member.id}`}
      // Clear of the sticky tabs when arriving from a report.
      className="flex scroll-mt-20 flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0"
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
          {!member.isAdmin ? (
            <span className="ml-2 text-[0.75rem] text-grey">
              {member.type === 'organization'
                ? 'Organization account'
                : member.type === 'mentor'
                  ? 'Mentor'
                  : 'Peer'}
            </span>
          ) : null}
          {member.isAdmin ? (
            <span className="ml-2 rounded-full bg-gold-lt px-2 py-0.5 font-bold text-[0.625rem] text-gold-dp uppercase tracking-wider">
              Admin
            </span>
          ) : null}
          {partnerTitle ? (
            <span className="ml-2 text-[0.75rem] text-grey">{PARTNER_ROLE_NAME}</span>
          ) : null}
          {isSelf ? <span className="ml-2 text-[0.6875rem] text-grey">you</span> : null}
        </span>
        <span className="mt-0.5 block text-[0.75rem] text-grey">
          {member.username ? `@${member.username} · ` : ''}
          {member.email ?? 'no email yet'}
          {member.phone ? ` · ${member.phone}` : ''} ·{' '}
          {[member.city, member.state].filter(Boolean).join(', ')} ·{' '}
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
          member.type !== 'organization' &&
          (member.type === 'mentor' || member.invitesUsed > 0) ? (
            <>
              {' '}
              ·{' '}
              {member.unlimitedInvites
                ? `${member.invitesUsed} invites used · no limit`
                : `${member.invitesUsed} of ${MENTOR_ALLOWANCE} invites used`}
            </>
          ) : null}
        </span>
        {/* Whether the club can reach them (the owner, 2026-10-21). */}
        {reach && !member.isSeed ? (
          <span className="mt-0.5 block text-[0.75rem] text-grey">{reachInWords(reach)}</span>
        ) : null}
      </span>

      {/* None on an administrator's row: every control it could carry is one
          the database refuses. */}
      {member.isAdmin ? null : (
        <button
          type="button"
          onClick={onToggle}
          // Begins with the word on the button, for voice control.
          aria-label={`Manage ${member.displayName}`}
          aria-expanded={expanded}
          aria-controls={`member-controls-${member.id}`}
          className={cn(
            'flex min-h-[44px] flex-none items-center gap-1 rounded-[10px] px-3 font-semibold text-[0.8125rem] transition-colors',
            expanded ? 'bg-action text-white' : 'bg-tint text-emphasis hover:bg-line',
          )}
        >
          Manage
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
          />
        </button>
      )}

      {busy ? (
        <p role="status" className="flex w-full items-center gap-2 text-[0.8125rem] text-grey">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Saving changes…
        </p>
      ) : member.isAdmin || !expanded ? null : (
        <div
          id={`member-controls-${member.id}`}
          className="grid w-full gap-3 border-line border-t pt-3 sm:grid-cols-2"
        >
          <fieldset className="min-w-0">
            <legend className="mb-2 font-bold text-[0.75rem] text-grey">Account type</legend>
            <div className="flex flex-wrap gap-2">
              <SmallButton onClick={onToggleMentor}>
                {member.type === 'peer' ? 'Make mentor' : 'Make peer'}
              </SmallButton>
              {member.type !== 'organization' && !member.isSeed ? (
                <SmallButton onClick={onMakeOrganization}>Make organization account</SmallButton>
              ) : null}
            </div>
          </fieldset>
          {onSetPartner ? (
            <fieldset className="min-w-0 sm:col-span-2">
              <legend className="mb-2 font-bold text-[0.75rem] text-grey">
                {PARTNER_ROLE_NAME}
              </legend>
              {partnerTitle ? (
                <p className="mb-2 text-[0.8125rem] text-ink">{partnerTitle}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <SmallButton
                  onClick={() => {
                    setPartnering(partnerTitle ?? '');
                  }}
                >
                  {partnerTitle ? 'Change title' : `Make ${PARTNER_ROLE_NAME.toLowerCase()}`}
                </SmallButton>
                {partnerTitle ? (
                  <SmallButton
                    destructive
                    onClick={() => {
                      setUnpartnering(true);
                    }}
                  >
                    Remove as {PARTNER_ROLE_NAME.toLowerCase()}
                  </SmallButton>
                ) : null}
              </div>
            </fieldset>
          ) : null}
          <fieldset className="min-w-0">
            <legend className="mb-2 font-bold text-[0.75rem] text-grey">Membership</legend>
            <div className="flex flex-wrap gap-2">
              {member.status === 'active' ? (
                <SmallButton onClick={onPause}>Pause</SmallButton>
              ) : (
                <SmallButton onClick={onResume}>Resume</SmallButton>
              )}
              {atLimit ? null : (
                <SmallButton
                  onClick={() => {
                    setStriking(true);
                  }}
                >
                  Strike
                </SmallButton>
              )}
              <SmallButton
                destructive
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Remove
              </SmallButton>
            </div>
          </fieldset>
        </div>
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
            with Resume. Removing deletes both, and can also block their email address.
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
            className="mt-1 w-full rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[0.8125rem] outline-none focus:border-emphasis"
          />
        </ConfirmPanel>
      ) : null}

      {unpartnering ? (
        <ConfirmPanel
          title={`Remove ${member.displayName} as a ${PARTNER_ROLE_NAME.toLowerCase()}?`}
          confirmLabel="Remove the role"
          onCancel={() => {
            setUnpartnering(false);
          }}
          onConfirm={() => {
            setUnpartnering(false);
            onRemovePartner?.();
          }}
        >
          <p>
            Their title goes from their name, their own codes stop letting people in, and they can
            no longer introduce members. Introductions already made stay.
          </p>
        </ConfirmPanel>
      ) : partnering !== null ? (
        <Panel
          title={
            partnerTitle
              ? `${member.displayName}’s title`
              : `Make ${member.displayName} a ${PARTNER_ROLE_NAME.toLowerCase()}?`
          }
          buttons={
            <>
              <PanelButton
                onClick={() => {
                  setPartnering(null);
                }}
              >
                Cancel
              </PanelButton>
              <PanelButton
                disabled={partnering.trim().length < 2}
                onClick={() => {
                  const title = partnering.trim();
                  setPartnering(null);
                  onSetPartner?.(title);
                }}
              >
                Save
              </PanelButton>
            </>
          }
        >
          {partnerTitle ? null : (
            <p>
              For professionals who work with people with SCI/D. They can invite without a limit,
              make codes of their own, introduce members to each other, and see who they invited or
              introduced. They see nobody’s messages or contact details.
            </p>
          )}
          <label
            className="mt-2 block font-semibold text-[0.75rem] text-ink"
            htmlFor={`partner-title-${member.id}`}
          >
            Title shown beside their name
          </label>
          <input
            id={`partner-title-${member.id}`}
            value={partnering}
            maxLength={80}
            onChange={(e) => {
              setPartnering(e.target.value);
            }}
            placeholder="Physical therapist, SCI-FIT"
            className="mt-1 w-full rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[0.8125rem] outline-none focus:border-emphasis"
          />
        </Panel>
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
            className="mt-1 w-full rounded-[10px] border border-line bg-paper px-2.5 py-2 text-[0.8125rem] outline-none focus:border-emphasis"
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
              and who they followed — and rejoining later does not
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
            their name on it, and so do the photographs they sent. Nobody else's copy of a
            conversation is deleted by somebody leaving it.
          </p>
          {/* The one question worth asking at this moment, and the only thing
              separating this from a ban. Left unticked, the address is free
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
              <span className="block font-bold text-ink">
                {member.email ? 'Block this email address too' : 'Block this number too'}
              </span>
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
        'min-h-[44px] rounded-full px-3.5 text-[0.78125rem] transition-colors',
        destructive
          ? 'bg-destructive-fill font-bold font-head text-white hover:bg-destructive-fill/85 disabled:opacity-40 disabled:hover:bg-destructive-fill'
          : 'bg-tint font-semibold text-emphasis hover:bg-line disabled:opacity-40 disabled:hover:bg-tint',
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
  onResend,
  onReinvite,
  onBlock,
}: {
  invite: AdminInvite;
  /** How many times this address has been invited and withdrawn. */
  times?: number;
  busy: boolean;
  onRevoke: () => void;
  onResend: () => void;
  onReinvite: (email: string) => void;
  onBlock: (reason: string | null) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reinviting, setReinviting] = useState(false);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const vouchedBy = vouchedBy_(invite);
  const oldPhone = isOldPhoneInvite(invite);
  const delivery = deliveryNote(invite);
  const who = inviteLabel(invite);
  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0">
      {/* A basis rather than a bare flex-1, so at the largest text setting
          this column holds its width and the buttons wrap to their own row. */}
      <span className="min-w-0 flex-1 basis-[13rem]">
        <span className="block break-words font-extrabold font-head text-[0.90625rem]">
          {who}
          {oldPhone ? (
            <span className="ml-2 rounded-full bg-tint px-2 py-0.5 font-bold text-[0.625rem] text-emphasis">
              phone invite (old)
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[0.75rem] text-grey">
          {vouchedBy} ·{' '}
          <span
            className={cn(
              // A member is on it: the healthy case, and the only one worth
              // weight. Pending with an account behind it is the one row that
              // asks the reader to do something: somebody tried and stopped.
              invite.status === 'consumed' && invite.heldBy !== null && 'font-bold text-emphasis',
              invite.status === 'revoked' && 'text-destructive',
              invite.status === 'pending' && invite.hasAccount === true && 'font-bold text-gold-dp',
            )}
          >
            {inviteState(invite)}
          </span>
          {delivery ? ` · ${delivery}` : ''}
          {invite.note ? ` · ${invite.note}` : ''}
          {times > 1 ? ` · withdrawn ${times} times` : ''}
        </span>
      </span>

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-grey" />
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {invite.status === 'pending' && invite.email ? (
            <SmallButton onClick={onResend}>
              {invite.sentAt ? 'Resend link' : 'Send link'}
            </SmallButton>
          ) : null}
          {oldPhone && invite.status !== 'consumed' ? (
            <SmallButton
              onClick={() => {
                setReinviting((open) => !open);
              }}
            >
              Re-invite by email
            </SmallButton>
          ) : null}
          {canRevoke(invite) ? (
            <SmallButton
              destructive
              onClick={() => {
                const ok = window.confirm(
                  `Take ${who} off the list?\n\nThey will not be able to join with it. They can be added again later.`,
                );
                if (ok) onRevoke();
              }}
            >
              Revoke
            </SmallButton>
          ) : null}
          {/* Offered on every email row, including one already revoked and one
              a member is on. Revoke asks "is this person on the list"; Block
              asks "should this address ever be", and a withdrawn invite is
              exactly where somebody decides the answer is never. An old phone
              invite has no address to block. */}
          {invite.email ? (
            <SmallButton
              destructive
              onClick={() => {
                setConfirming(true);
              }}
            >
              Block…
            </SmallButton>
          ) : null}
        </span>
      )}

      {reinviting && !busy ? (
        <form
          className="flex basis-full flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!looksLikeEmail(email)) return;
            setReinviting(false);
            onReinvite(email.trim());
            setEmail('');
          }}
        >
          <span className="min-w-[12rem] flex-1">
            <label htmlFor={`reinvite-${invite.id}`} className="block font-bold text-[0.75rem]">
              Email address for {invite.phone}
            </label>
            <input
              id={`reinvite-${invite.id}`}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="name@example.com"
              className="mt-1 min-h-[44px] w-full rounded-[10px] border border-line bg-canvas px-3 text-[0.875rem] outline-none focus:border-emphasis"
            />
          </span>
          <button
            type="submit"
            disabled={!looksLikeEmail(email)}
            className="min-h-[44px] rounded-full bg-action px-4 font-bold font-head text-[0.8125rem] text-white disabled:opacity-40"
          >
            Send the link
          </button>
        </form>
      ) : null}

      {confirming && invite.email ? (
        <ConfirmPanel
          title={`Block ${invite.email}?`}
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
            Nobody — no organization and no mentor — can put this address on the list until an
            administrator unblocks it. Its invite is withdrawn.
            {invite.heldBy ? ` ${invite.heldBy} stays a member; remove them separately.` : ''}
          </p>
          <ReasonField id={`reason-invite-${invite.id}`} value={reason} onChange={setReason} />
        </ConfirmPanel>
      ) : null}
    </div>
  );
}

/** "Notifications on, 2 devices · Home Screen app, Oct 20" */
export function reachInWords(reach: MemberReach): string {
  const notifications =
    reach.pushDevices === 0
      ? 'Notifications off'
      : reach.pushDevices === 1
        ? 'Notifications on'
        : `Notifications on, ${reach.pushDevices} devices`;
  const app = reach.homeScreenAt
    ? `Home Screen app, last signed in ${new Date(reach.homeScreenAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })}`
    : 'No Home Screen app seen';
  return `${notifications} · ${app}`;
}
