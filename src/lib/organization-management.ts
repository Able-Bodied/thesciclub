import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { preparePhoto } from '@/lib/image';
import { PHOTOS_BUCKET } from '@/lib/photos';
import { getSupabase } from '@/lib/supabase';

export interface OrganizationDraft {
  shortCode: string;
  name: string;
  city: string;
  description: string;
  tags: string[];
  canInvite: boolean;
  /** '' clears it; null or absent keeps what is saved. */
  state?: string | null;
}

/** A place as the editor sends it; `id` keeps an existing row and its pin. */
export interface OrganizationPlaceDraft {
  id?: string;
  label: string | null;
  address: string | null;
  city: string;
  state: string;
}

/** Replaces the organization's places, in order; the first is its main one. */
export async function saveOrganizationPlaces(
  organizationId: string,
  places: OrganizationPlaceDraft[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = (await getSupabase().rpc('save_organization_places', {
      p_organization: organizationId,
      p_places: places.map((place) => ({
        ...(place.id ? { id: place.id } : {}),
        label: place.label,
        address: place.address,
        city: place.city,
        state: place.state,
      })),
    })) as { error: Failure | null };
    return error
      ? { ok: false, error: describeError(error, 'The locations were not saved.') }
      : { ok: true };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'The locations were not saved.') };
  }
}

/** Returns the organization's id, which a new one only has once it is saved. */
export async function saveOrganization(
  id: string | null,
  draft: OrganizationDraft,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('save_organization', {
      organization: id,
      short_code: draft.shortCode,
      name: draft.name,
      city: draft.city,
      description: draft.description,
      tags: draft.tags,
      can_invite: draft.canInvite,
      state: draft.state ?? null,
    })) as { data: string | null; error: Failure | null };
    return error
      ? {
          ok: false,
          error: describeError(error, {
            attempt: 'The organization was not saved.',
            duplicate: 'That name or short code is already in use.',
          }),
        }
      : { ok: true, id: data ?? id ?? '' };
  } catch (error) {
    return { ok: false, error: describeThrown(error, 'The organization was not saved.') };
  }
}

/** The long edge a logo is kept at. The badge draws it at 66px at most; this covers a 4x screen. */
const LOGO_EDGE = 400;
const LOGO_REFUSAL = 'The logo was not saved.';

/**
 * Gives an organization a new logo, or none (`file` null).
 *
 * Upload, then point the row at it, then delete the file it replaced — see
 * 20261009040000 for why in that order. A new random name each time, so a
 * cached signed URL for the old picture cannot outlive the change. Only a
 * file in this organization's own folder is deleted afterwards: the seeded
 * NorCal SCI logo sits outside one, and its editor did not put it there.
 */
export async function saveOrganizationLogo(
  organizationId: string,
  file: File | null,
): Promise<{ ok: true; path: string | null } | { ok: false; error: string }> {
  const supabase = getSupabase();
  try {
    let path: string | null = null;
    if (file) {
      const { blob, ext } = await preparePhoto(file, LOGO_EDGE, '#ffffff');
      path = `organizations/${organizationId}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, blob, { upsert: false, contentType: blob.type });
      if (upload.error) return { ok: false, error: describeError(upload.error, LOGO_REFUSAL) };
    }
    const { data, error } = (await supabase.rpc('set_organization_logo', {
      organization: organizationId,
      logo_path: path,
    })) as { data: string | null; error: Failure | null };
    if (error) {
      if (path) await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
      return { ok: false, error: describeError(error, LOGO_REFUSAL) };
    }
    const previous = data;
    if (previous && previous !== path && previous.startsWith(`organizations/${organizationId}/`)) {
      // Its failure is not reported: the new logo is saved either way.
      await supabase.storage.from(PHOTOS_BUCKET).remove([previous]);
    }
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: describeThrown(error, LOGO_REFUSAL) };
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
