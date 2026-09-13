import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAccount } from '@/lib/account';
import { cn } from '@/lib/utils';
import { InviteForm } from '@/routes/admin/invite-form';
import {
  type AdminInvite,
  type AdminMember,
  type BlockedNumber,
  blockNumber,
  canRevoke,
  deleteMember,
  fetchAdminMembers,
  fetchBlockedNumbers,
  fetchInvites,
  inviteState,
  revokeInvite,
  setMemberStatus,
  setMemberType,
  unblockNumber,
  vouchedBy as vouchedBy_,
} from '@/routes/admin/members-admin';

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
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [blocked, setBlocked] = useState<BlockedNumber[]>([]);
  const [tab, setTab] = useState<'members' | 'invites'>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [memberResult, inviteResult, blockedRows] = await Promise.all([
      fetchAdminMembers(),
      fetchInvites(),
      fetchBlockedNumbers(),
    ]);
    if (memberResult.ok) setMembers(memberResult.members);
    if (inviteResult.ok) setInvites(inviteResult.invites);
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
   * Runs one administrative action and returns nothing.
   *
   * Deliberately not async: these are handed to onClick, which expects void,
   * and an async handler's rejection there goes unhandled — so a dropped
   * connection would leave the row spinning with no error shown. Everything is
   * caught here instead, including a thrown one.
   */
  function act(id: string, run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(id);
    run()
      .then(async (result) => {
        if (!result.ok) {
          setError(result.error ?? 'That did not work.');
          return;
        }
        setError(null);
        await load();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  /**
   * Ask twice, in two different ways: a confirmation that spells out what is
   * about to happen to a real person, and then the reason, which Cancel
   * aborts. Ban is the only action here that both deletes a profile and
   * forecloses the way back, and it sits next to buttons that do neither.
   */
  function confirmBan(label: string, phone: string, onReason: (reason: string | null) => void) {
    const ok = window.confirm(
      `Block ${label} from The SCI Club?\n\nTheir profile is deleted, their invite is revoked, and nobody — no organization and no mentor — can put this number back on the list until it is unblocked.`,
    );
    if (!ok) return;
    const reason = window.prompt(
      `Why is ${phone} being blocked? Only administrators see this. Leave it blank if you would rather not say; Cancel stops the block.`,
      '',
    );
    if (reason === null) return;
    onReason(reason.trim() || null);
  }

  const real = members.filter((m) => !m.isSeed);
  const seeded = members.filter((m) => m.isSeed);
  const pending = invites.filter((i) => i.status === 'pending');
  // Three lists, because "The list" should mean the numbers that are on it.
  // Withdrawn rows used to sit among them and accumulate forever, which is
  // what made deleting them look necessary — they carry who vouched and when,
  // and the partial unique index means they cost nothing where they are.
  const onTheList = invites.filter((i) => i.status !== 'revoked');
  const withdrawn = invites.filter((i) => i.status === 'revoked');

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
            {(['members', 'invites'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                }}
                aria-pressed={tab === value}
                className={cn(
                  'rounded-full px-3.5 py-[7px] font-semibold text-[0.84375rem] capitalize',
                  tab === value ? 'bg-navy text-white' : 'bg-tint text-ink2',
                )}
              >
                {value}
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

        {loading ? (
          <p className="py-10 text-center text-[0.875rem] text-grey">Loading the roster…</p>
        ) : (
          <div className="mx-auto w-full max-w-[760px]">
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
                      onBlock={() => {
                        confirmBan(invite.phone, invite.phone, (reason) => {
                          act(invite.id, () => blockNumber(invite.phone, reason));
                        });
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
                    {withdrawn.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        busy={busyId === invite.id}
                        onRevoke={() => {
                          act(invite.id, () => revokeInvite(invite.id));
                        }}
                        onBlock={() => {
                          confirmBan(invite.phone, invite.phone, (reason) => {
                            act(invite.id, () => blockNumber(invite.phone, reason));
                          });
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
                  onSuspend={() => {
                    act(m.id, () => setMemberStatus(m.id, 'suspended'));
                  }}
                  onReactivate={() => {
                    act(m.id, () => setMemberStatus(m.id, 'active'));
                  }}
                  onDelete={() => {
                    act(m.id, () => deleteMember(m.id));
                  }}
                  onToggleMentor={() => {
                    act(m.id, () => setMemberType(m.id, m.type === 'mentor' ? 'peer' : 'mentor'));
                  }}
                  onBlock={() => {
                    confirmBan(m.displayName, m.phone, (reason) => {
                      act(m.id, () => blockNumber(m.phone, reason));
                    });
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
              subtitle="Seeded from NorCal SCI. Suspending one hides it from the deck."
              hidden={tab !== 'members'}
            >
              {seeded.map((m) => (
                <Row
                  key={m.id}
                  member={m}
                  busy={busyId === m.id}
                  isSelf={false}
                  onSuspend={() => {
                    act(m.id, () => setMemberStatus(m.id, 'suspended'));
                  }}
                  onReactivate={() => {
                    act(m.id, () => setMemberStatus(m.id, 'active'));
                  }}
                  onDelete={() => {
                    act(m.id, () => deleteMember(m.id));
                  }}
                  onToggleMentor={() => {
                    act(m.id, () => setMemberType(m.id, m.type === 'mentor' ? 'peer' : 'mentor'));
                  }}
                  onBlock={() => {
                    confirmBan(m.displayName, m.phone, (reason) => {
                      act(m.id, () => blockNumber(m.phone, reason));
                    });
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
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <>
      <h2 className="mt-4 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h2>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">{subtitle}</p>
      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">{children}</div>
    </>
  );
}

function Row({
  member,
  busy,
  isSelf,
  onSuspend,
  onReactivate,
  onDelete,
  onToggleMentor,
  onBlock,
}: {
  member: AdminMember;
  busy: boolean;
  isSelf: boolean;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  onToggleMentor: () => void;
  onBlock: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0">
      <span className="min-w-0 flex-1">
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
          {member.invitesUsed !== undefined &&
          !member.isSeed &&
          (member.type === 'mentor' || member.invitesUsed > 0) ? (
            <> · {member.invitesUsed} of 2 invites used</>
          ) : null}
        </span>
      </span>

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-grey" />
      ) : (
        <span className="flex flex-none gap-1.5">
          <SmallButton onClick={onToggleMentor}>
            {member.type === 'mentor' ? 'Make peer' : 'Make mentor'}
          </SmallButton>
          {member.status === 'active' ? (
            <SmallButton onClick={onSuspend}>Suspend</SmallButton>
          ) : (
            <SmallButton onClick={onReactivate}>Reactivate</SmallButton>
          )}
          <SmallButton
            destructive
            onClick={() => {
              const ok = window.confirm(
                `Delete ${member.displayName}'s profile permanently?\n\nTheir sign-in still exists but shows them nothing, and rejoining needs a fresh invite. This cannot be undone.`,
              );
              if (ok) onDelete();
            }}
          >
            Delete
          </SmallButton>
          {/* Deliberately last, and the only one that forecloses the way
              back. Delete removes somebody; Block removes them and keeps the
              number off the list. Seeded rows are excluded: nobody has ever
              signed in as one, so there is no conduct to answer for and the
              number is the organization's, not a person's. */}
          {member.isSeed ? null : (
            <SmallButton destructive onClick={onBlock}>
              Block
            </SmallButton>
          )}
        </span>
      )}
    </div>
  );
}

function SmallButton({
  destructive,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-[0.75rem]',
        destructive ? 'bg-destructive/10 text-destructive' : 'bg-tint text-navy',
      )}
    >
      {children}
    </button>
  );
}

function InviteRow({
  invite,
  busy,
  onRevoke,
  onBlock,
}: {
  invite: AdminInvite;
  busy: boolean;
  onRevoke: () => void;
  onBlock: () => void;
}) {
  const vouchedBy = vouchedBy_(invite);
  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0">
      <span className="min-w-0 flex-1">
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
        </span>
      </span>

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-grey" />
      ) : (
        <span className="flex flex-none gap-1.5">
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
          <SmallButton destructive onClick={onBlock}>
            Block
          </SmallButton>
        </span>
      )}
    </div>
  );
}
