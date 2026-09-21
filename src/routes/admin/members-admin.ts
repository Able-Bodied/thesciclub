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
  /**
   * Strikes that still count: not withdrawn, and inside `strike_window()`.
   * Counted by the database rather than here, so the roster, the member's own
   * card and the function that issues them cannot disagree about who is on two.
   */
  strikes: number;
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
  strikes: number | null;
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
    // A database that predates 20260916040000 reports nothing here, and no
    // strikes is the honest reading of that rather than a blank.
    strikes: row.strikes ?? 0,
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

/**
 * Clear a member's photo folder.
 *
 * `admin_delete_member` is a SQL function and cannot reach the storage API, so
 * this is the half of a removal that has to happen in the client. Permitted by
 * the policy added in 20260918000000; before it, an administrator could end a
 * membership and not remove the picture, which stayed retrievable at a URL
 * derived from the member's id because the bucket is public.
 *
 * Runs after the removal and never before, and its failure is not the caller's
 * failure: the membership is the thing being ended, and a picture that will not
 * delete must not make a successful removal report an error. It returns nothing
 * for that reason.
 */
async function clearPhotoFolder(memberId: string): Promise<void> {
  const supabase = getSupabase();
  const listed = await supabase.storage.from('photos').list(memberId);
  if (listed.error) return;
  const paths = listed.data.map((o) => `${memberId}/${o.name}`);
  if (paths.length > 0) await supabase.storage.from('photos').remove(paths);
}

// Not the photographs they put in chat. Those stay with their words — see
// 20260918200000 — and an administrator could not delete them anyway: the
// storage API deletes only what the caller can select, and a picture in a
// conversation an administrator is not in is not selectable by them, on
// purpose.
export async function deleteMember(target: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_delete_member', { target });
  if (error) return { ok: false, error: error.message };
  await clearPhotoFolder(target);
  return { ok: true };
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
  /** Whether that member is the club's administrator rather than a mentor. */
  invitedByMemberIsAdmin: boolean | undefined;
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
  invited_by_member_is_admin: boolean | null;
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
      invitedByMemberIsAdmin: row.invited_by_member_is_admin ?? undefined,
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
  /** Null when the administrator is vouching in their own name. */
  organizationId: string | null;
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

/**
 * Put the seeded directory back.
 *
 * Rehearsing the claim flow retires a seeded profile every time, by design,
 * so this exists to make that rehearsable. It restores missing rows and
 * resets the ones still there; it will not overwrite a real member, and it
 * skips anybody whose number now belongs to somebody who joined. Returns how
 * many rows it touched, which is the only feedback worth giving — "done"
 * would not distinguish a working restore from one that quietly matched
 * nothing.
 */
export async function restoreDirectory(): Promise<
  { ok: true; restored: number } | { ok: false; error: string }
> {
  const result = await getSupabase().rpc('admin_restore_directory');
  if (result.error) return { ok: false, error: result.error.message };
  // Cast rather than destructure: the client types rpc data as `any`, and
  // this count is rendered straight at the administrator.
  return { ok: true, restored: (result.data as number | null) ?? 0 };
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
  /**
   * The member on that number, where there is one.
   *
   * Blocking deletes them as part of blocking, so their photograph has to go
   * too — but the function takes a phone number and the storage folder is keyed
   * by member id, so the caller passes the id it already has on the row. Absent
   * for a number with nobody on it, which is the ordinary case for blocking an
   * invite that was never used.
   */
  memberId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_block_number', {
    raw_phone: phone,
    block_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  if (memberId) await clearPhotoFolder(memberId);
  return { ok: true };
}

export async function unblockNumber(phone: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_unblock_number', { raw_phone: phone });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * The withdrawn list: one row per number, and only numbers that are actually
 * off the list.
 *
 * Revoking does not delete, deliberately — the row keeps who vouched and
 * when, and the partial unique index means a revoked row costs nothing where
 * it is. But re-inviting a number writes a *new* row rather than reviving the
 * old one, which is also right: the second invitation is a separate act, by
 * possibly a different person, for possibly a different reason. Withdraw that
 * one too and the number has two revoked rows, then three.
 *
 * All of which is sound in the database and unreadable on a screen. So the
 * grouping happens here:
 *
 * - A number with a live invite is not withdrawn, whatever its history says.
 *   Without this a re-invited number appears in "The list" and in "Withdrawn"
 *   simultaneously, which is the most confusing thing this list could do.
 * - A blocked number belongs in Blocked, not in both.
 * - Everything else collapses to its most recent invitation, with a count
 *   when there has been more than one. Repeatedly inviting and withdrawing
 *   the same number is worth seeing as a number, not as five rows that look
 *   like a bug.
 *
 * Most recent first, by when the invitation was created: `admin_invites` does
 * not carry `revoked_at`, and the newest invitation for a number is the one
 * whose withdrawal came last anyway.
 */
export interface WithdrawnNumber {
  /** The most recent withdrawn invitation for this number. */
  invite: AdminInvite;
  /** How many times this number has been invited and withdrawn. */
  times: number;
}

export function withdrawnNumbers(
  invites: AdminInvite[],
  blockedPhones: string[] = [],
): WithdrawnNumber[] {
  const onTheList = new Set(invites.filter((i) => i.status !== 'revoked').map((i) => i.phone));
  const blocked = new Set(blockedPhones);

  const byPhone = new Map<string, AdminInvite[]>();
  for (const invite of invites) {
    if (invite.status !== 'revoked') continue;
    if (onTheList.has(invite.phone) || blocked.has(invite.phone)) continue;
    const group = byPhone.get(invite.phone);
    if (group) group.push(invite);
    else byPhone.set(invite.phone, [invite]);
  }

  return [...byPhone.values()]
    .map((group) => {
      const newest = group.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
      return { invite: newest, times: group.length };
    })
    .sort((a, b) => b.invite.createdAt.localeCompare(a.invite.createdAt));
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
  // A member inviter used to mean a mentor and nothing else. An
  // administrator can now add a number in their own name, and calling them a
  // mentor on every one of those would be wrong on the record that exists to
  // say who vouched.
  if (invite.invitedByMember) {
    return `${invite.invitedByMember} (${invite.invitedByMemberIsAdmin ? 'admin' : 'mentor'})`;
  }
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

/* ----------------------------------------------------------------- strikes */

export interface Strike {
  id: string;
  memberId: string;
  reason: string;
  issuedAt: string;
  issuedByName: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
  /** Whether it still counts towards three. A withdrawn or year-old one does not. */
  counts: boolean;
}

interface StrikeRow {
  id: string;
  member_id: string;
  reason: string;
  issued_at: string;
  issued_by_name: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  counts: boolean;
}

function toStrike(row: StrikeRow): Strike {
  return {
    id: row.id,
    memberId: row.member_id,
    reason: row.reason,
    issuedAt: row.issued_at,
    issuedByName: row.issued_by_name,
    withdrawnAt: row.withdrawn_at,
    withdrawnReason: row.withdrawn_reason,
    counts: row.counts,
  };
}

/** Every strike the club has issued, newest first. Administrators only. */
export async function fetchStrikes(): Promise<
  { ok: true; strikes: Strike[] } | { ok: false; error: string }
> {
  const result = await getSupabase()
    .from('admin_strikes')
    .select('*')
    .order('issued_at', { ascending: false });
  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, strikes: (result.data as StrikeRow[]).map(toStrike) };
}

/**
 * Give somebody a strike, and report how many now count.
 *
 * The count comes back from `admin_add_strike` rather than being worked out
 * here, because /admin acts on it: the strike that reaches `strike_limit()` is
 * the one that opens the question of what happens to the membership. Counting
 * on this side would be a second implementation of `active_strike_count()`,
 * free to drift from the one the database refuses a fourth strike on.
 *
 * `strikes` is undefined on a database that predates 20260917000000, where the
 * function returned void. Nothing is offered on that reading — an absent count
 * is not a third strike.
 */
export async function addStrike(
  target: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; strikes?: number }> {
  // Not destructured: the client types rpc data as `any`, and taking it out
  // by name would spread that through the return. A number is what this
  // function gives back; anything else is a database that does not report it.
  const result = await getSupabase().rpc('admin_add_strike', {
    target,
    strike_reason: reason,
  });
  if (result.error) return { ok: false, error: result.error.message };
  const count: unknown = result.data;
  return typeof count === 'number' ? { ok: true, strikes: count } : { ok: true };
}

export async function withdrawStrike(
  strike: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase().rpc('admin_withdraw_strike', {
    strike,
    withdraw_reason: reason,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
