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

/* ----------------------------------------------------------------- invites */

export interface AdminInvite {
  id: string;
  phone: string;
  status: 'pending' | 'consumed' | 'revoked';
  note: string | null;
  createdAt: string;
  invitedByOrganization: string | null;
  invitedByMember: string | null;
  /** The seeded profile this invite entitles its holder to claim, if any. */
  claimableName: string | null;
  /**
   * The member on this number.
   *
   * Three values, and they are three different things. A name is a member who
   * is here. `null` is "nobody is on this number". `undefined` is "this copy of
   * the view does not report it" — `held_by` arrived in a later migration, and
   * a deployment where the app is ahead of the database gets that.
   *
   * Keeping the third apart from the second matters: conflating them printed
   * "that account has since been deleted" against every used invite on a
   * database that simply had not been migrated yet, including the club's own
   * administrator.
   */
  heldBy: string | null | undefined;
  heldByStatus: 'active' | 'suspended' | 'removed' | null | undefined;
}

interface AdminInviteRow {
  id: string;
  phone: string;
  status: string;
  note: string | null;
  created_at: string;
  invited_by_organization: string | null;
  invited_by_member: string | null;
  claimable_name: string | null;
  held_by: string | null;
  held_by_status: string | null;
}

export interface InvitingOrganization {
  id: string;
  name: string;
  shortCode: string;
}

export interface ClaimableProfile {
  id: string;
  displayName: string;
  city: string | null;
  state: string;
}

export async function fetchInvites(): Promise<
  { ok: true; invites: AdminInvite[] } | { ok: false; error: string }
> {
  const result = await getSupabase()
    .from('admin_invites')
    .select('*')
    .order('created_at', { ascending: false });
  if (result.error) return { ok: false, error: result.error.message };
  return {
    ok: true,
    invites: (result.data as AdminInviteRow[]).map((row) => ({
      id: row.id,
      phone: row.phone,
      status: row.status as AdminInvite['status'],
      note: row.note,
      createdAt: row.created_at,
      invitedByOrganization: row.invited_by_organization,
      invitedByMember: row.invited_by_member,
      claimableName: row.claimable_name,
      heldBy: row.held_by,
      heldByStatus: row.held_by_status as AdminInvite['heldByStatus'],
    })),
  };
}

/** Organizations allowed to vouch. Public data, but only listed to admins here. */
export async function fetchInvitingOrganizations(): Promise<InvitingOrganization[]> {
  const result = await getSupabase()
    .from('organizations')
    .select('id, name, short_code')
    .eq('can_invite', true)
    .order('name');
  if (result.error) return [];
  return (result.data as { id: string; name: string; short_code: string }[]).map((o) => ({
    id: o.id,
    name: o.name,
    shortCode: o.short_code,
  }));
}

export async function fetchClaimableProfiles(): Promise<ClaimableProfile[]> {
  const result = await getSupabase()
    .from('admin_claimable_members')
    .select('id, display_name, city, state')
    .order('display_name');
  if (result.error) return [];
  return (
    result.data as { id: string; display_name: string; city: string | null; state: string }[]
  ).map((m) => ({ id: m.id, displayName: m.display_name, city: m.city, state: m.state }));
}

export async function createInvite(input: {
  phone: string;
  organizationId: string;
  claimMemberId: string | null;
  note: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_create_invite', {
    raw_phone: input.phone,
    organization: input.organizationId,
    claim_member: input.claimMemberId,
    invite_note: input.note,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function revokeInvite(target: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_revoke_invite', { target });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setMemberType(
  target: string,
  type: 'peer' | 'mentor',
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_set_member_type', {
    target,
    new_type: type,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * What an invite's state is, in English.
 *
 * The status alone was printed raw, so a consumed invite whose member has
 * since been deleted read "consumed" — which asserts that somebody used this
 * and is in the club, when nobody is. The list is read by whoever decides who
 * belongs; it should not assert that.
 *
 * Nor should it assert the opposite. `heldBy` being absent means this database
 * does not report holders yet, which is not the same as there being none, and
 * saying nothing is the honest answer there.
 */
export function inviteState(invite: AdminInvite): string {
  if (invite.status === 'revoked') return 'revoked';
  if (invite.status === 'pending') return 'not used yet';

  // The view does not carry a holder. Say what the status says and no more.
  if (invite.heldBy === undefined) return 'used';

  // Used once, and nobody is on the number now. "Unused" rather than an
  // explanation of what became of them: what an administrator is reading this
  // column for is whether the number is backing anybody, and it is not.
  // Deletion revokes as of 20260912000000, so new ones do not land here.
  if (invite.heldBy === null) return 'unused';

  if (invite.heldByStatus === 'removed') return `used by ${invite.heldBy}, who was removed`;
  if (invite.heldByStatus === 'suspended') return `used by ${invite.heldBy}, suspended`;
  return `used by ${invite.heldBy}`;
}
