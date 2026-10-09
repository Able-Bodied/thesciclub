import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/** The database decides both access and the cap. Links may change without
 * changing a member's account type, so type alone cannot answer this. */
export function useInvitePermissions(memberId: string | null) {
  const [state, setState] = useState({
    memberId: null as string | null,
    canInvite: false,
    unlimited: false,
    loading: true,
    error: null as string | null,
  });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: The reload revision intentionally starts a new read.
  useEffect(() => {
    const controller = new AbortController();
    if (!memberId) {
      setState({ memberId, canInvite: false, unlimited: false, loading: false, error: null });
      return;
    }
    setState({ memberId, canInvite: false, unlimited: false, loading: true, error: null });
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc('my_invite_permissions')
          .abortSignal(controller.signal)) as {
          data: { can_invite: boolean; unlimited: boolean }[] | null;
          error: Failure | null;
        };
        if (controller.signal.aborted) return;
        if (error) throw new Error(describeError(error, 'Could not load your invite permissions.'));
        const row = data?.[0];
        setState({
          memberId,
          canInvite: row?.can_invite ?? false,
          unlimited: row?.unlimited ?? false,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            memberId,
            canInvite: false,
            unlimited: false,
            loading: false,
            error: describeThrown(error, 'Could not load your invite permissions.'),
          });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [memberId, revision]);
  // Never redirect or draw the previous account's permissions during sign-in.
  const current =
    state.memberId === memberId
      ? state
      : { canInvite: false, unlimited: false, loading: true, error: null };
  return { ...current, reload };
}
