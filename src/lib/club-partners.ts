import { useEffect, useState } from 'react';
import type { Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Club partners (20261029100000): professionals an administrator made
 * partners, such as a hospital's peer support lead or a physical therapist,
 * shown with their title beside their name. Nothing here is the permission
 * check; the database decides, and these only choose what to draw.
 */

/** What the role is called wherever it is shown. One place to rename it. */
export const PARTNER_ROLE_NAME = 'Club partner';

/** member id → title, e.g. "Physical therapist, SCI-FIT". */
export type PartnerTitles = ReadonlyMap<string, string>;

let titles: Promise<PartnerTitles> | null = null;

/** Read once and shared; `forgetPartnerTitles` after a change. */
export function fetchPartnerTitles(): Promise<PartnerTitles> {
  titles ??= (async () => {
    const { data, error } = (await getSupabase().from('club_partners').select('member_id, title')) as {
      data: { member_id: string; title: string }[] | null;
      error: Failure | null;
    };
    if (error) {
      titles = null;
      return new Map();
    }
    return new Map((data ?? []).map((row) => [row.member_id, row.title]));
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

/** Whether the signed-in member is a partner: null while asking. */
export function useIAmPartner(memberId: string | null): boolean | null {
  const [state, setState] = useState<{ memberId: string | null; partner: boolean | null }>({
    memberId: null,
    partner: null,
  });
  useEffect(() => {
    if (!memberId) {
      setState({ memberId, partner: false });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc('i_am_partner')
          .abortSignal(controller.signal)) as { data: boolean | null; error: Failure | null };
        if (controller.signal.aborted) return;
        setState({ memberId, partner: error ? false : Boolean(data) });
      } catch {
        if (!controller.signal.aborted) setState({ memberId, partner: false });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [memberId]);
  return state.memberId === memberId ? state.partner : null;
}
