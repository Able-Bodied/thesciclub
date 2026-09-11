import { getSupabase } from '@/lib/supabase';
import { injuryDateOf, type OnboardingData } from '@/routes/onboarding/types';

/**
 * Turning the wizard's answers into the member row.
 *
 * The phone written here is the one auth verified, taken from the session
 * rather than from what was typed — the insert policy compares against
 * `auth.jwt()`, so a typed value that had drifted would be refused anyway, and
 * reading it from the session means it cannot drift in the first place.
 *
 * The invite is consumed and any claimed seed row retired by a database
 * trigger, not here. Doing it in the client would mean an interrupted signup
 * could leave an invite spent with no member behind it.
 */

export interface SubmitResult {
  ok: boolean;
  /** The database's own sentence when it refuses, so the cause is not guessed at. */
  error?: string;
}

export async function submitOnboarding(data: OnboardingData): Promise<SubmitResult> {
  const supabase = getSupabase();

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user?.phone) {
    return { ok: false, error: 'You are not signed in. Start again from your phone number.' };
  }

  const injury = injuryDateOf(data);
  if (!injury || !data.levelRange) {
    return { ok: false, error: 'Some answers are missing. Go back a step.' };
  }

  let photoPath: string | null = null;
  if (data.photoFile) {
    const ext = data.photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/profile.${ext}`;
    const upload = await supabase.storage
      .from('photos')
      .upload(path, data.photoFile, { upsert: true });
    // A photo that will not upload must not cost somebody their signup — it is
    // the one optional answer in the flow. Carry on without it.
    if (!upload.error) photoPath = path;
  }

  const { error } = await supabase.from('members').insert({
    id: user.id,
    phone: user.phone,
    display_name: data.displayName.trim(),
    birth_date: data.birthDate,
    level_range: data.levelRange,
    completeness: data.completeness,
    injury_date: injury.date,
    injury_date_precision: injury.precision,
    city: data.city.trim() || null,
    state: data.state.trim(),
    photo_path: photoPath,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
