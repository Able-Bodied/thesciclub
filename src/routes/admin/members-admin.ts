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
  /**
   * Invites this member has spent, counted by live_invite_count() — the same
   * function the insert policy caps on, so the roster cannot disagree with it.
   * `undefined` where the view does not report it yet.
   */
  invitesUsed: number | undefined;
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
  invites_used: number | null;
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
    invitesUsed: row.invites_used ?? undefined,
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
  /**
   * Whether anybody has ever verified this number.
   *
   * Not the same question as `heldBy`, and the gap between them is the point:
   * an invite that is still pending while an account exists is somebody who
   * started and stopped. The invite is consumed by a trigger on the *member*
   * insert, so abandoning onboarding leaves no trace anywhere else.
   *
   * `undefined` is again "this copy of the view does not report it", for the
   * same reason it is on `heldBy`.
   */
  hasAccount: boolean | undefined;
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
  has_account: boolean | null;
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
      hasAccount: row.has_account ?? undefined,
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

  // Pending with an account behind it is the case nobody could see: they
  // verified the number, landed in onboarding and stopped. Worth saying,
  // because it is the one state on this list somebody would act on — the
  // person tried and something got in the way.
  if (invite.status === 'pending') {
    return invite.hasAccount === true ? 'signed up, never finished joining' : 'not used yet';
  }

  // The view does not carry a holder. Say what the status says and no more.
  if (invite.heldBy === undefined) return 'used';

  // Used once, and nobody is on the number now — which is the same thing an
  // administrator needs to know about it as a number that was never used at
  // all: nobody is behind it, and you can take it off the list. It reads the
  // same because it is the same, and a separate word for it only invited the
  // question of what the difference was. The row keeps its 'consumed' status
  // in the database, so the history is not lost, only the distinction that
  // nobody could act on.
  if (invite.heldBy === null) return 'not used yet';

  if (invite.heldByStatus === 'removed') return `used by ${invite.heldBy}, who was removed`;
  if (invite.heldByStatus === 'suspended') return `used by ${invite.heldBy}, suspended`;
  return `used by ${invite.heldBy}`;
}

/* --------------------------------------------------------- blocked numbers */

export interface BlockedNumber {
  id: string;
  phone: string;
  reason: string | null;
  blockedAt: string;
  blockedBy: string | null;
}

interface BlockedNumberRow {
  id: string;
  phone: string;
  reason: string | null;
  blocked_at: string;
  blocked_by: string | null;
}

/**
 * The blocklist.
 *
 * Empty rather than failing when the view is absent: the app is deployed
 * ahead of the database often enough in this project that a missing view
 * should cost a section of a screen, not the screen. `/admin` still lists
 * members and invites on a database that has not been migrated.
 */
export async function fetchBlockedNumbers(): Promise<BlockedNumber[]> {
  const result = await getSupabase()
    .from('admin_blocked_numbers')
    .select('*')
    .order('blocked_at', { ascending: false });
  if (result.error) return [];
  return (result.data as BlockedNumberRow[]).map((row) => ({
    id: row.id,
    phone: row.phone,
    reason: row.reason,
    blockedAt: row.blocked_at,
    blockedBy: row.blocked_by,
  }));
}

/**
 * Ban a number: the member on it is deleted, their invite revoked, and the
 * number barred from the list until somebody unblocks it.
 *
 * All of that happens inside `admin_block_number` rather than as three calls
 * from here. A ban half-applied — number blocked, member still in the deck —
 * is the state this is meant to prevent, and a dropped connection between two
 * client calls is exactly how you would get one.
 */
export async function blockNumber(
  phone: string,
  reason: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_block_number', {
    raw_phone: phone,
    block_reason: reason,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function unblockNumber(phone: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_unblock_number', { raw_phone: phone });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Who put this number on the list, and what kind of thing they are.
 *
 * The view has carried the organization and the member separately since it
 * was written, and the page collapsed them into one name — so "NorCal SCI"
 * and "Todd" read identically. Which of the two vouched is exactly what
 * matters when a number turns out to belong to somebody who should not be
 * here: an organization's invite is a process, a mentor's is a person who can
 * be asked about it.
 */
export function vouchedBy(invite: AdminInvite): string {
  if (invite.invitedByOrganization) return invite.invitedByOrganization;
  if (invite.invitedByMember) return `${invite.invitedByMember} (mentor)`;
  // The inviter's account is gone — `on delete set null` keeps the invite and
  // drops who issued it, which is honest and is not a bug to paper over.
  return 'unknown';
}

/**
 * Whether an administrator can take this number off the list.
 *
 * A pending invite, always. A used one only when nobody is on the number —
 * revoking a live member's invite would take their membership away through the
 * wrong door, and admin_set_member_status is that door. With the member gone
 * there is no door to use instead, and the row is otherwise unreachable while
 * still blocking the number from being invited again.
 *
 * `undefined` is not `null`: a view that does not report holders cannot tell
 * us nobody is there, so the button stays hidden rather than offering an
 * action the database will refuse.
 */
export function canRevoke(invite: AdminInvite): boolean {
  if (invite.status === 'pending') return true;
  return invite.status === 'consumed' && invite.heldBy === null;
}
