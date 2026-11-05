import { useEffect, useState } from 'react';
import type { Failure } from '@/lib/describe-error';
import { useKeptRead } from '@/lib/kept-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * Verified professionals (20261029100000; trusted partners, then professionals,
 * until the owner, 2026-11-04): an administrator makes them, such as a
 * hospital's peer support lead or a physical therapist, and each names their
 * profession on Me (20261104160000). Shown beside their name with a mark. The
 * code still says partner. Nothing here is the permission check; the database
 * decides, and these only choose what to draw.
 */

/** What the role is called wherever it is shown. One place to rename it. */
export const PARTNER_ROLE_NAME = 'Verified professional';

/** member id → title, e.g. "Physical therapist, SCI-FIT"; null until they write one. */
export type PartnerTitles = ReadonlyMap<string, string | null>;

let titles: Promise<PartnerTitles> | null = null;

/** Read once and shared; `forgetPartnerTitles` after a change. */
export function fetchPartnerTitles(): Promise<PartnerTitles> {
  titles ??= (async () => {
    // A failure, or no client at all as in tests, draws no label until asked again.
    const failed = () => {
      titles = null;
      return new Map<string, string | null>();
    };
    try {
      const { data, error } = (await getSupabase()
        .from('club_partners')
        .select('member_id, title')) as {
        data: { member_id: string; title: string | null }[] | null;
        error: Failure | null;
      };
      if (error) return failed();
      return new Map((data ?? []).map((row) => [row.member_id, row.title]));
    } catch {
      return failed();
    }
  })();
  return titles;
}

export function forgetPartnerTitles(): void {
  titles = null;
}

/** Null until read. A failure draws no label, which is the safe way to fail. */
export function usePartnerTitles(): PartnerTitles | null {
  const [state, setState] = useState<PartnerTitles | null>(null);
  useEffect(() => {
    let live = true;
    void fetchPartnerTitles().then((found) => {
      if (live) setState(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function useYesOrNo(question: string, memberId: string | null): boolean | null {
  const [state, setState] = useState<{ memberId: string | null; yes: boolean | null }>({
    memberId: null,
    yes: null,
  });
  const kept = useKeptRead();
  useEffect(() => {
    if (!memberId) {
      setState({ memberId, yes: false });
      return;
    }
    // A kept tab shown again within the minute (lib/kept-reads.ts).
    if (kept.fresh(memberId)) return;
    const landed = kept.start(memberId);
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc(question)
          .abortSignal(controller.signal)) as { data: boolean | null; error: Failure | null };
        if (controller.signal.aborted) return;
        setState({ memberId, yes: error ? false : Boolean(data) });
        if (!error) landed();
      } catch {
        if (!controller.signal.aborted) setState({ memberId, yes: false });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [question, memberId, kept]);
  return state.memberId === memberId ? state.yes : null;
}

/** Whether the signed-in member is a partner: null while asking. */
export function useIAmPartner(memberId: string | null): boolean | null {
  return useYesOrNo('i_am_partner', memberId);
}

/** A partner, an org admin or an administrator: null while asking. */
export function useICanConnect(memberId: string | null): boolean | null {
  return useYesOrNo('i_can_connect', memberId);
}
