import { getSupabase } from '@/lib/supabase';
import { injuryDateOf, type OnboardingData } from '@/routes/onboarding/types';
import { rangeForExact } from '@/types/domain';

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

  // Everything past the birthday can be skipped, so none of it is required
  // here. The two that were checked are the two the schema already allows for:
  // `level_range` has a 'Not sure yet' value and `injury_date` is nullable,
  // paired with its precision. Refusing them here would have been the client
  // inventing a rule the database does not have — and it is the rule that
  // would stop somebody claiming a seeded profile getting in.
  const injury = injuryDateOf(data);

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
    // Asked once, as an exact level; the range is derived so the two cannot
    // disagree about the same person.
    level_range: data.exactLevel ? rangeForExact(data.exactLevel) : 'Not sure yet',
    exact_level: !data.exactLevel || data.exactLevel === 'Do not know' ? null : data.exactLevel,
    completeness: data.completeness,
    // Paired: members_injury_date_precision_paired requires both or neither.
    injury_date: injury?.date ?? null,
    injury_date_precision: injury?.precision ?? null,
    city: data.city.trim() || null,
    // Null, not '': an empty string sorts and compares as though it were a
    // place, and two people who skipped it are not from the same one.
    state: data.state.trim() || null,
    photo_path: photoPath,
    // Carried from the wizard rather than written as it happened: the row does
    // not exist until this insert, so a decline collected on the injury step
    // has nowhere to go until now. The database refuses the name and the
    // birthday here (members_declined_excludes_required) and neither can be
    // declined in the flow, so nothing filters them out on the way.
    declined: data.declined,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
