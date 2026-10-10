import { describe, expect, it } from 'vitest';
import { MEMBER_TEXT_MAX, memberTextMax } from '@/lib/member-limits';
import { QUESTIONS } from '@/routes/profile/questions';
import LENGTH_LIMITS from '../../supabase/migrations/20261003100000_a_member_row_has_length_limits.sql?raw';
import EQUIPMENT_AND_GRANTS from '../../supabase/migrations/20261011020000_adaptive_equipment_and_grants.sql?raw';

/** column → limit, as the migrations' check constraints state them. */
function databaseLimits(): Map<string, number> {
  const limits = new Map<string, number>();
  const sql = `${LENGTH_LIMITS}\n${EQUIPMENT_AND_GRANTS}`;
  for (const match of sql.matchAll(/check \(char_length\(([a-z_]+)\) <= (\d+)\)/g)) {
    limits.set(match[1] ?? '', Number(match[2]));
  }
  return limits;
}

describe('member text limits', () => {
  it('are the numbers the database enforces', () => {
    const database = databaseLimits();
    for (const [column, max] of Object.entries(MEMBER_TEXT_MAX)) {
      expect(database.get(column), column).toBe(max);
    }
  });

  it('cover every free-text question in the survey', () => {
    const text = QUESTIONS.filter((question) => question.kind === 'text');
    expect(text.length).toBeGreaterThan(0);
    for (const question of text) {
      expect(memberTextMax(question.column), question.column).toBeDefined();
    }
  });

  it('give no limit for a column that is not free text', () => {
    expect(memberTextMax('level_range')).toBeUndefined();
  });
});
