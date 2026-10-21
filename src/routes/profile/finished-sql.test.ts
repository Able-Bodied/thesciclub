import { describe, expect, it } from 'vitest';
import { DECLINABLE_DETAILS } from '@/routes/profile/details-api';
import { QUESTIONS, SPECIFICS_FOR } from '@/routes/profile/questions';
import SQL from '../../../supabase/migrations/20261022040000_finish_your_profile_reminders.sql?raw';

/**
 * The reminders decide "finished" in the database (member_details_done,
 * member_profile_done), restating Me's rings. A question or a detail added
 * here and not there would remind somebody who had finished, or never remind
 * somebody who had not. A later migration that restates either function
 * should point this file at itself.
 */

function body(name: string): string {
  const start = SQL.indexOf(`function public.${name}(`);
  if (start === -1) throw new Error(`${name} is not in the migration`);
  return SQL.slice(start, SQL.indexOf('$$;', start));
}

describe('the database’s idea of finished', () => {
  const profile = body('member_profile_done');
  const details = body('member_details_done');

  it.each(QUESTIONS.map((q) => [q.key, q.column] as const))(
    'asks the survey’s %s, in column %s',
    (key, column) => {
      expect(profile).toContain(`m.${column},`);
      expect(profile).toContain(`'${key}'`);
    },
  );

  it('asks exactly the questions the survey has', () => {
    const asked = [...profile.matchAll(/profile_answered\(m\.(\w+),/g)].map((match) => match[1]);
    expect(asked.sort()).toEqual(QUESTIONS.map((q) => q.column).sort());
  });

  it('has a condition for each question that applies only sometimes', () => {
    const sometimes = QUESTIONS.filter((q) => q.onlyIf).map((q) => q.key);
    expect(sometimes.sort()).toEqual(['childrenWhen', 'detail']);
    for (const specific of SPECIFICS_FOR) expect(profile).toContain(`'${specific}'`);
  });

  it.each(DECLINABLE_DETAILS.map((d) => d.key))('asks Your details’ %s', (key) => {
    expect(details).toContain(`'${key}'`);
  });
});
