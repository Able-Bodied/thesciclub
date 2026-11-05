import { describe, expect, it } from 'vitest';
import { DECLINABLE_DETAILS } from '@/routes/profile/details-api';
import { QUESTIONS, SPECIFICS_FOR } from '@/routes/profile/questions';
import REMINDERS from '../../../supabase/migrations/20261022040000_finish_your_profile_reminders.sql?raw';
import LATEST from '../../../supabase/migrations/20261104140000_family_and_professionals_skip_before_or_after.sql?raw';

/**
 * The reminders decide "finished" in the database (member_details_done,
 * member_profile_done), restating Me's rings. A question or a detail added
 * here and not there would remind somebody who had finished, or never remind
 * somebody who had not. A later migration that restates either function
 * should point this file at itself (20261104140000 restates the profile's).
 */

const COUNTED = QUESTIONS.filter((q) => !q.uncounted);

const ABOUT_AN_INJURY = [
  'howInjured',
  'childrenWhen',
  'educationWhen',
  'independence',
  'employment',
  'interests',
  'sportsEquipment',
  'grants',
  'selfCare',
  'detail',
  'wantsToMentor',
];

function body(name: string, sql: string): string {
  const start = sql.indexOf(`function public.${name}(`);
  if (start === -1) throw new Error(`${name} is not in the migration`);
  return sql.slice(start, sql.indexOf('$$;', start));
}

describe('the database’s idea of finished', () => {
  const profile = body('member_profile_done', LATEST);
  const details = body('member_details_done', REMINDERS);

  it.each(COUNTED.map((q) => [q.key, q.column] as const))(
    'asks the survey’s %s, in column %s',
    (key, column) => {
      expect(profile).toContain(`m.${column},`);
      expect(profile).toContain(`'${key}'`);
    },
  );

  it('asks exactly the questions the survey has', () => {
    const asked = [...profile.matchAll(/profile_answered\(m\.(\w+),/g)].map((match) => match[1]);
    expect(asked.sort()).toEqual(COUNTED.map((q) => q.column).sort());
  });

  it('has a condition for each question that applies only sometimes', () => {
    const sometimes = QUESTIONS.filter((q) => q.onlyIf).map((q) => q.key);
    expect(sometimes.sort()).toEqual([...ABOUT_AN_INJURY].sort());
    for (const specific of SPECIFICS_FOR) expect(profile).toContain(`'${specific}'`);
  });

  // The owner, 2026-11-04: family and professionals skip these.
  it('counts the injury questions as done for family and professionals', () => {
    const guard = "coalesce(m.injury_type in ('family', 'professional'), false) or (";
    const after = profile.slice(profile.indexOf(guard));
    expect(profile).toContain(guard);
    for (const key of ABOUT_AN_INJURY) expect(after).toContain(`'${key}'`);
    const before = profile.slice(0, profile.indexOf(guard));
    for (const key of ABOUT_AN_INJURY) expect(before).not.toContain(`'${key}'`);
  });

  it.each(DECLINABLE_DETAILS.map((d) => d.key))('asks Your details’ %s', (key) => {
    expect(details).toContain(`'${key}'`);
  });
});
