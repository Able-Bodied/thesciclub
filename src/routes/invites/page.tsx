import { Mail } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { useOwnMember } from '@/lib/members';
import { formatPhoneInput, isCompletePhone } from '@/lib/phone';
import {
  canWithdraw,
  createMyInvite,
  fetchMyInvites,
  inviteState,
  MENTOR_ALLOWANCE,
  type MentorInvite,
  slotsLeft,
  withdrawMyInvite,
} from '@/routes/invites/mentor-invites';

/**
 * A mentor's invites.
 *
 * CONTEXT.md has promised since the beginning that a mentor can put two
 * numbers on the club's list, and the database has enforced exactly two since
 * the first invites migration. Until this screen there was nowhere to do it:
 * `/admin` was the only invite surface and an ordinary mentor cannot reach it,
 * so the Invites card on Me stated the allowance and then offered no way to
 * spend it.
 *
 * Nothing here decides who may invite. The three mentor policies do, and
 * supabase/tests/mentor-invites.sql runs them as a real mentor session. What
 * this screen owes a member is that the database's answer arrives as a
 * sentence rather than as a constraint name.
 */

/** Formatted the way the club writes numbers back to people: +1 (408) 555-0112. */
function displayPhone(e164: string): string {
  const d = e164.length === 11 && e164.startsWith('1') ? e164.slice(1) : e164;
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function InvitesPage() {
  const account = useAccount();
  const userId = account.status === 'member' ? account.userId : null;
  const { member, loading: memberLoading } = useOwnMember(userId);
  const [invites, setInvites] = useState<MentorInvite[]>([]);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMyInvites();
    if (result.ok) setInvites(result.invites);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (account.status === 'member') void load();
  }, [account.status, load]);

  if (account.status === 'loading' || memberLoading) return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member') return <Navigate to="/join" replace />;
  // Not the permission check — the insert policy refuses a peer either way.
  // This is so somebody who follows a stale link sees the club rather than a
  // form that would fail on submit.
  if (member && member.type !== 'mentor') return <Navigate to="/me" replace />;

  const left = slotsLeft(invites);
  const ready = isCompletePhone(phone) && left > 0 && userId !== null;

  /**
   * Deliberately not async: these are handed to onClick, which expects void,
   * and an async handler's rejection there goes unhandled — so a dropped
   * connection would leave a row spinning with no error shown.
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
        setError(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  function add() {
    if (!userId) return;
    act('new', async () => {
      const result = await createMyInvite({
        phone,
        memberId: userId,
        note: note.trim() || null,
      });
      if (result.ok) {
        setPhone('');
        setNote('');
      }
      return result;
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        {/* The same measure as the content below. Left at the page edge, the
            title sat 460px to the left of the card it names on a desktop, and
            read as a heading for the empty space beside it. */}
        <div className="mx-auto w-full max-w-[560px]">
          <BackLink to="/me" label="Me" />
          <h1 className="mt-1 font-extrabold font-head text-[1.5625rem] text-ink tracking-[-0.02em]">
            Your invites
          </h1>
          <p className="mt-1 text-[0.78125rem] text-grey">
            {left === 0
              ? `All ${MENTOR_ALLOWANCE} of your invites are in use.`
              : `${left} of your ${MENTOR_ALLOWANCE} invites ${left === 1 ? 'is' : 'are'} free.`}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        <div className="mx-auto w-full max-w-[560px]">
          {error ? (
            <p className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}

          {/* Stated before the form, not after a refusal. Somebody typing a
              number deserves to know the invite is the whole of it — the club
              does not send the message, and nothing arrives until the person
              downloads the app and verifies that number themselves. */}
          <div className="rounded-[14px] border border-line bg-paper p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-tint text-navy">
                <Mail className="h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1 text-[0.78125rem] text-ink2 leading-[1.45]">
                Adding a number puts it on the club's list. The club does not text them — tell them
                yourself, and they join by verifying that number in the app.
              </p>
            </div>

            {/* Above the fields, not under the button. Below it, a mentor
                with nothing left met a dead form first and the reason for it
                last. */}
            {left === 0 ? (
              <p className="mt-3 rounded-r-[9px] border-gold border-l-[3px] bg-gold-lt px-3 py-2 text-[0.78125rem] text-[#5C4409] leading-[1.45]">
                Withdraw one below to free a slot. An invite somebody has already used stays spent
                until they leave the club.
              </p>
            ) : null}

            <div className="mt-3">
              <label
                htmlFor="mentor-invite-phone"
                className="block font-bold text-[0.75rem] text-ink"
              >
                Phone number
              </label>
              <input
                id="mentor-invite-phone"
                type="tel"
                inputMode="tel"
                placeholder="(408) 555-0112"
                value={phone}
                disabled={left === 0}
                onChange={(e) => {
                  setPhone(formatPhoneInput(e.target.value));
                }}
                className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-navy disabled:opacity-40"
              />
            </div>

            <div className="mt-2.5">
              <label
                htmlFor="mentor-invite-note"
                className="block font-bold text-[0.75rem] text-ink"
              >
                Who are they? (only you see this)
              </label>
              <input
                id="mentor-invite-note"
                placeholder="Met at rugby practice"
                value={note}
                disabled={left === 0}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line px-3 py-2 text-[0.9375rem] outline-none focus:border-navy disabled:opacity-40"
              />
            </div>

            <button
              type="button"
              disabled={!ready || busyId !== null}
              onClick={add}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[11px] bg-navy font-bold font-head text-[0.875rem] text-white disabled:opacity-40"
            >
              {busyId === 'new' ? 'Adding…' : 'Add to the list'}
            </button>
          </div>

          <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
            Numbers you have added
          </h2>

          {loading ? (
            <p className="py-8 text-center text-[0.875rem] text-grey">Loading your invites…</p>
          ) : invites.length === 0 ? (
            <p className="rounded-[14px] border border-line bg-paper px-3.5 py-6 text-center text-[0.875rem] text-grey leading-[1.5]">
              You have not added anybody yet.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center gap-3 border-line border-b p-3.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                      {displayPhone(invite.phone)}
                    </span>
                    <span className="mt-0.5 block text-[0.78125rem] text-grey leading-[1.45]">
                      {inviteState(invite)}
                      {invite.note ? ` · ${invite.note}` : ''}
                    </span>
                  </span>
                  {canWithdraw(invite) ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => {
                        act(invite.id, () => withdrawMyInvite(invite.id));
                      }}
                      className="min-h-[40px] flex-none rounded-full bg-destructive/10 px-3.5 font-bold font-head text-[0.8125rem] text-destructive disabled:opacity-40"
                    >
                      {busyId === invite.id ? 'Withdrawing…' : 'Withdraw'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
