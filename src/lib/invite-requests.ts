import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Asking an org admin for an invite (the owner, 2026-10-28; 20261029010000).
 *
 * Signed out, somebody picks an organization's org admin from
 * invite_request_choices() and sends request_invite(). The org admins of that
 * organization read my_invite_requests() on Invites and answer each one.
 * The database decides who may do each of these.
 */

type Failure = Parameters<typeof describeError>[0];
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(
  name: string,
  args: Record<string, unknown>,
  refusal: string,
): Promise<Result<T>> {
  try {
    const { data, error } = (await getSupabase().rpc(name, args)) as {
      data: T;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, refusal) };
    return { ok: true, value: data };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

export interface InviteRequestChoice {
  organizationId: string;
  name: string;
  shortCode: string;
  logoPath: string | null;
  /** First names only, for a page anybody can open. */
  admins: { id: string; firstName: string }[];
}

interface ChoiceRow {
  organization_id: string;
  name: string;
  short_code: string;
  logo_path: string | null;
  admins: { id: string; first_name: string }[] | null;
}

export async function fetchInviteRequestChoices(): Promise<Result<InviteRequestChoice[]>> {
  const result = await call<ChoiceRow[] | null>(
    'invite_request_choices',
    {},
    'Could not load who to ask.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: (result.value ?? []).map((row) => ({
      organizationId: row.organization_id,
      name: row.name,
      shortCode: row.short_code,
      logoPath: row.logo_path,
      admins: (row.admins ?? []).map((admin) => ({ id: admin.id, firstName: admin.first_name })),
    })),
  };
}

export interface InviteRequest {
  organizationId: string;
  adminId: string;
  name: string;
  email: string;
  note: string;
}

export function requestInvite(request: InviteRequest): Promise<Result<null>> {
  return call<null>(
    'request_invite',
    {
      p_organization: request.organizationId,
      p_admin: request.adminId,
      p_name: request.name.trim(),
      p_email: request.email.trim(),
      p_note: request.note.trim() || null,
    },
    'Your request was not sent.',
  );
}

export interface ReceivedInviteRequest {
  id: string;
  organizationId: string;
  organizationName: string;
  /** The first name of the org admin they chose. */
  asked: string | null;
  name: string;
  email: string;
  note: string | null;
  createdAt: string;
}

interface ReceivedRow {
  id: string;
  organization_id: string;
  organization_name: string;
  asked: string | null;
  name: string;
  email: string;
  note: string | null;
  created_at: string;
}

export async function fetchMyInviteRequests(): Promise<Result<ReceivedInviteRequest[]>> {
  const result = await call<ReceivedRow[] | null>(
    'my_invite_requests',
    {},
    'Could not load invite requests.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: (result.value ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      asked: row.asked,
      name: row.name,
      email: row.email,
      note: row.note,
      createdAt: row.created_at,
    })),
  };
}

export function answerInviteRequest(
  requestId: string,
  answer: 'invited' | 'dismissed',
): Promise<Result<null>> {
  return call<null>(
    'answer_invite_request',
    { p_request: requestId, p_answer: answer },
    'The request was not updated.',
  );
}
