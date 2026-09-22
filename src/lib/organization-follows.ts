import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
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
  loading: boolean;
  error: string | null;
  /** Follow or unfollow, whichever the current state is not. */
  toggle: (organizationId: string) => void;
}

export function useOrganizationFollows(): FollowsState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setFollowing(new Set());
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

    void load(memberId);
    return () => {
      controller.abort();
    };
  }, [memberId]);

  const toggle = useCallback(
    (organizationId: string) => {
      if (!memberId) return;
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

      const write = wasFollowing
        ? getSupabase()
            .from('organization_follows')
            .delete()
            .eq('member_id', memberId)
            .eq('organization_id', organizationId)
        : getSupabase()
            .from('organization_follows')
            .upsert(
              { member_id: memberId, organization_id: organizationId },
              { onConflict: 'member_id,organization_id' },
            );

      void Promise.resolve(write)
        .then(({ error: failure }) => {
          if (!failure) {
            setError(null);
            return;
          }
          undo();
          setError(
            describeError(
              failure,
              wasFollowing ? 'You still follow them.' : 'You are not following them yet.',
            ),
          );
        })
        .catch((e: unknown) => {
          undo();
          setError(
            describeThrown(
              e,
              wasFollowing ? 'You still follow them.' : 'You are not following them yet.',
            ),
          );
        });
    },
    [memberId, following],
  );

  return { following, loading, error, toggle };
}
