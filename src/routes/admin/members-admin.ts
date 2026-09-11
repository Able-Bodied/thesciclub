import { getSupabase } from '@/lib/supabase';

/**
 * The administrative view of the roster, and the two things an administrator
 * can do to a row.
 *
 * Everything goes through `admin_members` and the `admin_*` functions, which
 * check membership and administrator status in the database. Nothing here is
 * the permission check — this is the client asking, and the database deciding.
 */

export interface AdminMember {
  id: string;
  displayName: string;
  phone: string;
  type: 'peer' | 'mentor';
  status: 'active' | 'suspended' | 'removed';
  isAdmin: boolean;
  isSeed: boolean;
  city: string | null;
  state: string;
  createdAt: string;
}

interface AdminMemberRow {
  id: string;
  display_name: string;
  phone: string;
  type: string;
  status: string;
  is_admin: boolean;
  is_seed: boolean;
  city: string | null;
  state: string;
  created_at: string;
}

function toAdminMember(row: AdminMemberRow): AdminMember {
  return {
    id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    type: row.type === 'mentor' ? 'mentor' : 'peer',
    status: row.status as AdminMember['status'],
    isAdmin: row.is_admin,
    isSeed: row.is_seed,
    city: row.city,
    state: row.state,
    createdAt: row.created_at,
  };
}

export async function fetchAdminMembers(): Promise<
  { ok: true; members: AdminMember[] } | { ok: false; error: string }
> {
  const result = await getSupabase()
    .from('admin_members')
    .select('*')
    .order('created_at', { ascending: false });
  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, members: (result.data as AdminMemberRow[]).map(toAdminMember) };
}

/** The database's own refusal is passed through verbatim — it says why. */
export async function setMemberStatus(
  target: string,
  status: AdminMember['status'],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_set_member_status', {
    target,
    new_status: status,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteMember(target: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_delete_member', { target });
  return error ? { ok: false, error: error.message } : { ok: true };
}
