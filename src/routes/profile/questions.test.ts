import { describe, expect, it } from 'vitest';
import {
  type Answers,
  advancesItself,
  applicableQuestions,
  isAnswered,
  progressOf,
  QUESTIONS,
  questionFor,
  questionsOn,
  SCREENS,
  toggleMany,
} from '@/routes/profile/questions';

const screen = (title: string) => {
  const found = SCREENS.find((s) => s.title === title);
  if (!found) throw new Error(`no screen: ${title}`);
  return found;
};

describe('the question set', () => {
  it('does not ask again for anything onboarding already collected', () => {
    const columns = QUESTIONS.map((q) => q.column);
    for (const already of [
      'level_range',
      'exact_level',
      'completeness',
      'injury_date',
      'city',
      'state',
    ]) {
      expect(columns).not.toContain(already);
    }
  });

  it('every screen references questions that exist', () => {
    for (const s of SCREENS) {
      for (const key of s.keys) {
        expect(questionFor(key), `${s.title} -> ${key}`).toBeDefined();
      }
    }
  });

  it('every question appears on exactly one screen', () => {
    const placed = SCREENS.flatMap((s) => s.keys);
    expect(new Set(placed).size).toBe(placed.length);
    expect(new Set(placed)).toEqual(new Set(QUESTIONS.map((q) => q.key)));
  });

  it('caps interests at three, so the choices mean something', () => {
    expect(questionFor('interests')?.max).toBe(3);
  });
});

describe('conditional questions', () => {
  it('does not ask when children arrived until it knows there are children', () => {
    const family = screen('Family');
    expect(questionsOn(family, {}).map((q) => q.key)).toEqual(['maritalStatus', 'hasChildren']);
  });

  it('asks once the answer is yes', () => {
    const family = screen('Family');
    const keys = questionsOn(family, { hasChildren: true }).map((q) => q.key);
    expect(keys).toContain('childrenWhen');
  });

  it('drops the follow-up again if the answer changes to no', () => {
    const family = screen('Family');
    const keys = questionsOn(family, { hasChildren: false }).map((q) => q.key);
    expect(keys).not.toContain('childrenWhen');
  });
});

describe('isAnswered', () => {
  const q = (key: string) => {
    const found = questionFor(key);
    if (!found) throw new Error('missing');
    return found;
  };

  it('treats an empty array as unanswered', () => {
    expect(isAnswered(q('topics'), { topics: [] })).toBe(false);
    expect(isAnswered(q('topics'), { topics: ['Travel'] })).toBe(true);
  });

  it('treats whitespace as unanswered', () => {
    expect(isAnswered(q('bio'), { bio: '   ' })).toBe(false);
  });

  it('treats a deliberate "no" as answered — it is an answer', () => {
    expect(isAnswered(q('hasChildren'), { hasChildren: false })).toBe(true);
    expect(isAnswered(q('wantsToMentor'), { wantsToMentor: false })).toBe(true);
  });

  it('treats a missing value as unanswered', () => {
    expect(isAnswered(q('gender'), {})).toBe(false);
  });
});

describe('advancesItself', () => {
  it('is true for a screen of single-choice questions only', () => {
    expect(advancesItself(screen('Education'), {})).toBe(true);
    expect(advancesItself(screen('Day to day'), {})).toBe(true);
  });

  it('is false where a text answer is involved, because the person is not done until they say so', () => {
    expect(advancesItself(screen('How it happened'), {})).toBe(false);
    expect(advancesItself(screen('The specifics'), {})).toBe(false);
  });

  it('is false for a multi-select, for the same reason', () => {
    expect(advancesItself(screen('Interests'), {})).toBe(false);
    expect(advancesItself(screen('About you'), {})).toBe(false);
  });
});

describe('progress', () => {
  it('counts nothing at the start', () => {
    expect(progressOf({}).percent).toBe(0);
  });

  it('does not count a conditional question that does not apply', () => {
    const withoutKids: Answers = { hasChildren: false };
    const withKids: Answers = { hasChildren: true };
    expect(applicableQuestions(withoutKids).length).toBeLessThan(
      applicableQuestions(withKids).length,
    );
  });

  it('reaches a hundred when everything applicable is answered', () => {
    const answers: Answers = {};
    for (const q of QUESTIONS) {
      if (q.onlyIf) continue;
      answers[q.key] = q.kind === 'many' ? ['x'] : q.kind === 'yesno' ? false : 'answered';
    }
    expect(progressOf(answers).percent).toBe(100);
  });
});

describe('toggleMany', () => {
  it('adds and removes', () => {
    expect(toggleMany([], 'Travel')).toEqual(['Travel']);
    expect(toggleMany(['Travel'], 'Travel')).toEqual([]);
  });

  it('refuses to exceed the cap rather than silently dropping the oldest', () => {
    const three = ['a', 'b', 'c'];
    expect(toggleMany(three, 'd', 3)).toEqual(three);
  });

  it('still allows removing when at the cap', () => {
    expect(toggleMany(['a', 'b', 'c'], 'b', 3)).toEqual(['a', 'c']);
  });
});
