import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { cn } from '@/lib/utils';
import { InviteForm } from '@/routes/admin/invite-form';
import {
  type AdminInvite,
  type AdminMember,
  deleteMember,
  fetchAdminMembers,
  fetchInvites,
  revokeInvite,
  setMemberStatus,
  setMemberType,
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
  const [tab, setTab] = useState<'members' | 'invites'>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [memberResult, inviteResult] = await Promise.all([fetchAdminMembers(), fetchInvites()]);
    if (memberResult.ok) setMembers(memberResult.members);
    if (inviteResult.ok) setInvites(inviteResult.invites);
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

  const real = members.filter((m) => !m.isSeed);
  const seeded = members.filter((m) => m.isSeed);
  const pending = invites.filter((i) => i.status === 'pending');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <h1 className="font-extrabold font-head text-[25px] text-ink tracking-[-0.02em]">Admin</h1>
        <p className="mt-1 text-[12.5px] text-grey">
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
                'rounded-full px-3.5 py-[7px] font-semibold text-[13.5px] capitalize',
                tab === value ? 'bg-navy text-white' : 'bg-tint text-ink2',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        {error ? (
          <p className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-[14px] text-grey">Loading the roster…</p>
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
                  subtitle="Pending invites can be revoked; used ones cannot."
                >
                  {invites.map((invite) => (
                    <InviteRow
                      key={invite.id}
                      invite={invite}
                      busy={busyId === invite.id}
                      onRevoke={() => {
                        act(invite.id, () => revokeInvite(invite.id));
                      }}
                    />
                  ))}
                  {invites.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-grey">
                      Nobody is on the list yet.
                    </p>
                  ) : null}
                </Section>
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
                />
              ))}
              {real.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-grey">Nobody has joined yet.</p>
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
      <h2 className="mt-4 font-extrabold font-head text-[12px] text-grey uppercase tracking-[0.13em]">
        {title}
      </h2>
      <p className="mt-1 mb-2 text-[12px] text-grey leading-[1.45]">{subtitle}</p>
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
}: {
  member: AdminMember;
  busy: boolean;
  isSelf: boolean;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  onToggleMentor: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold font-head text-[14.5px]">
          {member.displayName}
          {member.isAdmin ? (
            <span className="ml-2 rounded-full bg-gold-lt px-2 py-0.5 font-bold text-[10px] text-gold-dp uppercase tracking-wider">
              Admin
            </span>
          ) : null}
          {isSelf ? <span className="ml-2 text-[11px] text-grey">you</span> : null}
        </span>
        <span className="mt-0.5 block text-[12px] text-grey">
          {member.phone} · {[member.city, member.state].filter(Boolean).join(', ')} ·{' '}
          <span className={cn(member.status !== 'active' && 'font-bold text-destructive')}>
            {member.status}
          </span>
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
        'whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-[12px]',
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
}: {
  invite: AdminInvite;
  busy: boolean;
  onRevoke: () => void;
}) {
  const vouchedBy = invite.invitedByOrganization ?? invite.invitedByMember ?? 'unknown';
  return (
    <div className="flex flex-wrap items-center gap-2 border-line border-b p-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold font-head text-[14.5px]">
          {invite.phone}
          {invite.claimableName ? (
            <span className="ml-2 rounded-full bg-tint px-2 py-0.5 font-bold text-[10px] text-navy">
              claims {invite.claimableName}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[12px] text-grey">
          {vouchedBy} ·{' '}
          <span
            className={cn(
              invite.status === 'consumed' && 'font-bold text-navy',
              invite.status === 'revoked' && 'text-destructive',
            )}
          >
            {invite.status}
          </span>
          {invite.note ? ` · ${invite.note}` : ''}
        </span>
      </span>

      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-grey" />
      ) : invite.status === 'pending' ? (
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
    </div>
  );
}
