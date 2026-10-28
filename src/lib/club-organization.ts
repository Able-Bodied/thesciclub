import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { RepresentedOrganization } from '@/types/domain';

/**
 * The SCI Club's own organization (organizations.is_the_club,
 * 20261028950000). Its mentors and admins are the club's, so its logo is
 * never shown on a role: a mentor of the club alone is plainly a mentor
 * (the owner, 2026-10-28). Read once per page load and shared.
 */
let asked: Promise<string | null> | undefined;

function readClubId(): Promise<string | null> {
  asked ??= (async () => {
    try {
      const { data } = await getSupabase()
        .from('organizations')
        .select('id')
        .eq('is_the_club', true)
        .is('removed_at', null)
        .maybeSingle();
      const id: unknown = data?.id;
      return typeof id === 'string' ? id : null;
    } catch {
      return null;
    }
  })();
  return asked;
}

/** The club's organization id once known; null before, or when there is none. */
export function useClubOrganizationId(needed = true): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!needed) return;
    let live = true;
    void readClubId().then((found) => {
      if (live) setId(found);
    });
    return () => {
      live = false;
    };
  }, [needed]);
  return id;
}

/** The organizations a role is shown with: every one but the club itself. */
export function withoutTheClub(
  organizations: RepresentedOrganization[],
  clubId: string | null,
): RepresentedOrganization[] {
  return clubId
    ? organizations.filter((organization) => organization.id !== clubId)
    : organizations;
}

/** Tests only: forget the answer. */
export function resetClubOrganization(): void {
  asked = undefined;
}
