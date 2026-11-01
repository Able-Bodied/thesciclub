import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Which organizations the viewer follows.
 *
 * ---------------------------------------------------------------------------
 * The filter is not optional, even though it looks like it is
 * ---------------------------------------------------------------------------
 * `organization_follows` has one select policy and it is `member_id =
 * auth.uid()`, so an unfiltered read genuinely does return only the viewer's
 * rows. The `.eq('member_id', …)` below is therefore not load-bearing today —
 * it is here because the mirror of this has bitten twice, most recently on
 * `member_strikes`, where a second policy for administrators was ORed in and an
 * unfiltered select started returning the whole club's rows to whoever had it.
 * A screen that means "mine" should say so, so that adding a policy later
 * cannot quietly change what this returns.
 *
 * See supabase/tests/organization-follows.sql step 6, which is the one that
 * matters: who a member follows is a statement about them that they did not
 * make to the room.
 *
 * ---------------------------------------------------------------------------
 * Following is an upsert and unfollowing is a delete
 * ---------------------------------------------------------------------------
 * The row's existence is the whole fact — there is no status column, the way
 * `event_dismissals` has none. The compound primary key makes the insert
 * idempotent, so neither caller has to know whether the viewer already follows
 * this one, which matters because the button can be pressed twice before the
 * first write lands.
 */

export interface FollowsState {
  /** Organization ids the viewer follows. Empty while loading. */
  following: Set<string>;
  /** Those the viewer has asked to join, which approve first (20261031010000). */
  requested: Set<string>;
  loading: boolean;
  error: string | null;
  /** Follow or unfollow, whichever the current state is not; or take back a request. */
  toggle: (organizationId: string) => void;
}

export function useOrganizationFollows(): FollowsState {
  const account = useAccount();
  const announce = useAnnounce();
  const memberId = account.status === 'member' ? account.userId : null;

  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setFollowing(new Set());
      setRequested(new Set());
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;

    async function load(id: string) {
      const { data, error: failure } = await getSupabase()
        .from('organization_follows')
        .select('organization_id')
        .eq('member_id', id)
        .abortSignal(signal);
      if (signal.aborted) return;
      if (failure) {
        // A database that predates 20260917020000 has no such table, and the
        // screens that read this should lose a button rather than a page.
        setFollowing(new Set());
        setError(describeError(failure, 'Could not load who you follow.'));
        setLoading(false);
        return;
      }
      setFollowing(new Set((data as { organization_id: string }[]).map((r) => r.organization_id)));
      setError(null);
      setLoading(false);
    }

    // Apart, and allowed to fail: a database before 20261031010000 has none.
    async function loadRequests(id: string) {
      const { data } = await getSupabase()
        .from('organization_join_requests')
        .select('organization_id')
        .eq('member_id', id)
        .abortSignal(signal);
      if (signal.aborted) return;
      setRequested(
        new Set(((data ?? []) as { organization_id: string }[]).map((r) => r.organization_id)),
      );
    }

    void load(memberId);
    void loadRequests(memberId);
    return () => {
      controller.abort();
    };
  }, [memberId]);

  const toggle = useCallback(
    (organizationId: string) => {
      if (!memberId) return;
      if (requested.has(organizationId)) {
        const wrote = (taken: boolean) => {
          setRequested((current) => {
            const next = new Set(current);
            if (taken) next.delete(organizationId);
            else next.add(organizationId);
            return next;
          });
        };
        wrote(true);
        const refused = 'Your request still stands.';
        void Promise.resolve(
          getSupabase().rpc('leave_organization', { p_organization: organizationId }),
        )
          .then(({ error: failure }) => {
            if (!failure) {
              setError(null);
              announce('You took back your request.');
              return;
            }
            wrote(false);
            setError(describeError(failure, refused));
          })
          .catch((e: unknown) => {
            wrote(false);
            setError(describeThrown(e, refused));
          });
        return;
      }

      // Moved on screen before the write lands, and put back if it fails.
      // Following is a one-tap opinion about a calendar; making somebody watch
      // a spinner for it would cost more than the thing is worth, and the
      // failure case is a button that returns to where it was.
      const wasFollowing = following.has(organizationId);
      setFollowing((current) => {
        const next = new Set(current);
        if (wasFollowing) next.delete(organizationId);
        else next.add(organizationId);
        return next;
      });

      const undo = () => {
        setFollowing((current) => {
          const next = new Set(current);
          if (wasFollowing) next.add(organizationId);
          else next.delete(organizationId);
          return next;
        });
      };

      // Join replaces Follow (the owner, 2026-10-30): the database keeps this
      // table to the members (20261030000000).
      const write = getSupabase().rpc(wasFollowing ? 'leave_organization' : 'join_organization', {
        p_organization: organizationId,
      });

      void Promise.resolve(write)
        .then(({ data, error: failure }) => {
          if (!failure) {
            setError(null);
            // It approves first, which only the database knows for certain.
            if (!wasFollowing && data === 'requested') {
              undo();
              setRequested((current) => new Set(current).add(organizationId));
              announce('You asked to join. Its org admins will decide.');
              return;
            }
            // The button moved before the write; this says the write held.
            announce(wasFollowing ? 'You left the organization.' : 'You joined the organization.');
            return;
          }
          undo();
          const said = describeError(
            failure,
            wasFollowing ? 'You are still a member.' : 'You did not join.',
          );
          setError(said);
          announce(said);
        })
        .catch((e: unknown) => {
          undo();
          setError(
            describeThrown(e, wasFollowing ? 'You are still a member.' : 'You did not join.'),
          );
        });
    },
    [memberId, following, requested, announce],
  );

  return { following, requested, loading, error, toggle };
}
