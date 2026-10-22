import { describeError } from '@/lib/describe-error';
import { preparePhoto } from '@/lib/image';
import { toE164 } from '@/lib/phone';
import { uploadPhoto } from '@/lib/photos';
import { getSupabase } from '@/lib/supabase';
import { injuryDateOf, type OnboardingData, spinalCordAnswered } from '@/routes/onboarding/types';
import { rangeForExact } from '@/types/domain';

/**
 * Turning the wizard's answers into the member row.
 *
 * The member row's id is the signed-in account's. The invite is consumed by a
 * database trigger, not here: doing it in the client would mean an
 * interrupted signup could leave an invite spent with no member behind it.
 * The phone is the optional number "for events" the member typed, unverified
 * (the account is the email now), so it is written as given and left null when
 * skipped.
 */

export interface SubmitResult {
  ok: boolean;
  /** The database's own sentence when it refuses, so the cause is not guessed at. */
  error?: string;
  /**
   * Storage refused the photograph, and nothing was written: the page goes
   * back to the photo step with the sentence, where "Skip for now" still
   * lets them in.
   */
  photoRefused?: boolean;
  /** The @name was taken between the check and the insert: back to that step. */
  usernameRefused?: boolean;
}

/** Whether a declinable detail was given after all. Keys as `DECLINABLE_DETAILS`. */
function answered(key: string, data: OnboardingData, hasInjuryDate: boolean): boolean {
  if (key === 'exactLevel') {
    return (
      (data.exactLevel !== null && data.exactLevel !== 'Do not know') ||
      (data.injuryType === 'condition' && data.conditionName.trim() !== '')
    );
  }
  if (key === 'injuryDate') return hasInjuryDate;
  if (key === 'city') return data.city.trim() !== '';
  if (key === 'state') return data.state.trim() !== '';
  if (key === 'photo') return data.photoFile !== null;
  return false;
}

export async function submitOnboarding(data: OnboardingData): Promise<SubmitResult> {
  const supabase = getSupabase();

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    return { ok: false, error: 'You are not signed in. Start again from the sign-in screen.' };
  }

  // Everything past the birthday can be skipped, so none of it is required
  // here. The two that were checked are the two the schema already allows for:
  // `level_range` has a 'Not sure yet' value and `injury_date` is nullable,
  // paired with its precision. Refusing them here would have been the client
  // inventing a rule the database does not have — and it is the rule that
  // would stop somebody claiming a seeded profile getting in.
  const injury = injuryDateOf(data);
  // A kind with what it needs. An answer outranks a decline, as `answered`
  // has it for the level.
  const spinalCord = spinalCordAnswered(data);

  let photoPath: string | null = null;
  if (data.photoFile) {
    // The same fitting the details form does, so a photograph added at signup
    // and one added later are the same thing in storage. See src/lib/image.ts.
    const { blob, ext } = await preparePhoto(data.photoFile);
    const path = `${user.id}/profile.${ext}`;
    const upload = await uploadPhoto(path, blob);
    // Refused, so stop before the row is written and say why. Until
    // 20260930040000 this carried on without the photograph and without a
    // word, which was harmless while the bucket took anything; with 2MB and
    // three types a member could choose a photograph, enter the club and
    // never learn it was not there. The owner's call, 2026-09-30: stay on
    // the photo step with the sentence. A photograph still cannot cost
    // somebody their signup, because "Skip for now" is on that step.
    if (upload.error) {
      return {
        ok: false,
        photoRefused: true,
        error: describeError(upload.error, 'The photograph was not added.'),
      };
    }
    photoPath = path;
  }

  const { error } = await supabase.from('members').insert({
    id: user.id,
    username: data.username.trim().toLowerCase(),
    phone: toE164(data.phone),
    display_name: data.displayName.trim(),
    birth_date: data.birthDate,
    // Asked once, as an exact level; the range is derived so the two cannot
    // disagree about the same person.
    level_range: data.exactLevel ? rangeForExact(data.exactLevel) : 'Not sure yet',
    exact_level: !data.exactLevel || data.exactLevel === 'Do not know' ? null : data.exactLevel,
    completeness: data.completeness,
    // Unsaid (null) until it has what it needs: a kind with no level or name.
    injury_type: spinalCord ? data.injuryType : null,
    condition_name:
      spinalCord && data.injuryType === 'condition' ? data.conditionName.trim() || null : null,
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
    // A decline lifts once the thing is answered, as on the details form:
    // somebody who declined, went Back and filled it in has answered it.
    declined: data.declined.filter((key) => !answered(key, data, injury !== null)),
  });

  // The 18+ trigger and the name check are the two refusals a person can
  // cause from here, and the trigger already speaks in a sentence.
  if (error) {
    // Someone took the @name in the moment between the check and this insert.
    if (error.message.includes('members_username_key')) {
      return {
        ok: false,
        usernameRefused: true,
        error: 'That username was just taken. Choose another.',
      };
    }
    return {
      ok: false,
      error: describeError(error, {
        attempt: 'Your profile was not saved.',
        duplicate: 'You are already a member.',
        constraints: { members_display_name_check: 'A name cannot be blank.' },
      }),
    };
  }
  return { ok: true };
}
