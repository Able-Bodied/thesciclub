import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

export interface OrganizationDraft {
  shortCode: string;
  name: string;
  city: string;
  description: string;
  tags: string[];
  canInvite: boolean;
}

export async function saveOrganization(id: string | null, draft: OrganizationDraft) {
  try {
    const { error } = await getSupabase().rpc('save_organization', {
      organization: id,
      short_code: draft.shortCode,
      name: draft.name,
      city: draft.city,
      description: draft.description,
      tags: draft.tags,
      can_invite: draft.canInvite,
    });
    return error
      ? {
          ok: false,
          error: describeError(error, {
            attempt: 'The organization was not saved.',
            duplicate: 'That name or short code is already in use.',
          }),
        }
      : { ok: true };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'The organization was not saved.') };
  }
}

export async function removeOrganization(id: string) {
  try {
    const { error } = await getSupabase().rpc('admin_remove_organization', { organization: id });
    return error
      ? { ok: false, error: describeError(error, 'The organization was not removed.') }
      : { ok: true };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'The organization was not removed.') };
  }
}
