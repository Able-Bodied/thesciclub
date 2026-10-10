import { describe, expect, it } from 'vitest';
import {
  type Answers,
  advancesItself,
  answerInWords,
  applicableQuestions,
  canDecline,
  firstOpenScreen,
  isAnswered,
  progressOf,
  QUESTIONS,
  questionFor,
  questionsOn,
  SCREENS,
  screensThatApply,
  stepFrom,
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

describe('the specifics', () => {
  const specifics = screen('The specifics');
  const asked = (answers: Answers) => questionsOn(specifics, answers).length > 0;

  it('comes straight after self-care devices', () => {
    expect(SCREENS.indexOf(specifics)).toBe(SCREENS.indexOf(screen('Self-care devices')) + 1);
  });

  it('is asked after any one of its three self-care answers', () => {
    for (const choice of [
      'Dictation software',
      'Vehicle modifications',
      'Wheelchair assist devices',
    ]) {
      expect(asked({ selfCare: ['Botox', choice] }), choice).toBe(true);
    }
  });

  it('is not asked after any other self-care answer, or none', () => {
    expect(asked({})).toBe(false);
    expect(asked({ selfCare: [] })).toBe(false);
    expect(asked({ selfCare: ['Intermittent catheter', 'Standing frame'] })).toBe(false);
  });

  it('is still asked of somebody who already wrote something there', () => {
    expect(asked({ detail: 'Dragon on a Surface' })).toBe(true);
    expect(asked({ detail: '   ' })).toBe(false);
  });

  it('is stepped over, both ways, when it is not asked', () => {
    const selfCare = SCREENS.indexOf(screen('Self-care devices'));
    const after = SCREENS.indexOf(specifics) + 1;
    expect(screensThatApply({})).not.toContain(SCREENS.indexOf(specifics));
    expect(stepFrom(SCREENS.indexOf(specifics), 1, {})).toBe(after);
    expect(stepFrom(SCREENS.indexOf(specifics), -1, {})).toBe(selfCare);
    const chosen = { selfCare: ['Dictation software'] };
    expect(stepFrom(SCREENS.indexOf(specifics), 1, chosen)).toBe(SCREENS.indexOf(specifics));
  });

  it('does not count towards progress unless it is asked', () => {
    expect(applicableQuestions({}).map((q) => q.key)).not.toContain('detail');
    expect(
      applicableQuestions({ selfCare: ['Vehicle modifications'] }).map((q) => q.key),
    ).toContain('detail');
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
    expect(advancesItself(screen('How were you paralyzed?'), {})).toBe(false);
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

describe('declining a question', () => {
  const q = (key: string) => {
    const found = questionFor(key);
    if (!found) throw new Error('missing');
    return found;
  };

  // Skip leaves a null, which is honestly indistinguishable from "have not got
  // to it yet". Declining is a decision. Collapsing the two would either nag
  // the people who have decided or quietly finish a profile somebody meant to
  // come back to.
  it('counts as answered where a blank does not', () => {
    expect(isAnswered(q('bio'), {})).toBe(false);
    expect(isAnswered(q('bio'), {}, new Set(['bio']))).toBe(true);
  });

  it('does not answer a different question', () => {
    expect(isAnswered(q('bio'), {}, new Set(['topics']))).toBe(false);
  });

  it('moves the percentage, which is the whole point', () => {
    const blank = progressOf({});
    const declined = progressOf({}, new Set(['bio']));
    expect(declined.done).toBe(blank.done + 1);
    expect(declined.percent).toBeGreaterThan(blank.percent);
  });

  it('can carry a profile to 100 without a single answer', () => {
    // The case the owner asked for: somebody who would rather not give any of
    // it should still be able to finish.
    const everything = new Set(applicableQuestions({}).map((question) => question.key));
    expect(progressOf({}, everything).percent).toBe(100);
  });

  // The database refuses these too — members_declined_excludes_required. The
  // guard is here so the client does not offer a button the database would
  // answer with a constraint violation.
  it('is refused for the name and the birthday, under either spelling', () => {
    expect(canDecline('displayName')).toBe(false);
    expect(canDecline('name')).toBe(false);
    expect(canDecline('birthDate')).toBe(false);
    expect(canDecline('birthday')).toBe(false);
    expect(canDecline('bio')).toBe(true);
  });
});

describe('answers in words, for the overview', () => {
  const q = (key: string) => {
    const found = questionFor(key);
    if (!found) throw new Error(`no question: ${key}`);
    return found;
  };

  it('prints each kind of answer', () => {
    const answers: Answers = {
      bio: '  Rugby on Tuesdays.  ',
      languages: ['English', 'Spanish'],
      hasChildren: false,
    };
    expect(answerInWords(q('bio'), answers)).toBe('Rugby on Tuesdays.');
    expect(answerInWords(q('languages'), answers)).toBe('English, Spanish');
    expect(answerInWords(q('hasChildren'), answers)).toBe('No');
  });

  it('says so when there is no answer, rather than printing nothing', () => {
    expect(answerInWords(q('bio'), {})).toBe('Not answered yet');
    expect(answerInWords(q('languages'), { languages: [] })).toBe('Not answered yet');
  });

  it('prints a decline as the decision it is', () => {
    expect(answerInWords(q('bio'), { bio: 'x' }, new Set(['bio']))).toBe('Rather not say');
  });
});

describe('the first screen still open', () => {
  it('is the first with anything unanswered', () => {
    expect(firstOpenScreen({})).toBe(0);
    expect(firstOpenScreen({ gender: 'Woman', languages: ['English'] })).toBe(1);
  });

  it('counts a decline as dealt with', () => {
    expect(firstOpenScreen({ gender: 'Woman' }, new Set(['languages']))).toBe(1);
  });

  it('is none once everything is dealt with', () => {
    const everything = new Set(QUESTIONS.map((question) => question.key));
    expect(firstOpenScreen({}, everything)).toBeNull();
  });
});
