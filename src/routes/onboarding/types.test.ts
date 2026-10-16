import { describe, expect, it } from 'vitest';
import {
  INITIAL_ONBOARDING_DATA as base,
  canAdvance,
  injuryDateOf,
  injuryStepDeclined,
  type OnboardingData,
  type Step,
  stepNumber,
  withInjuryDeclined,
} from '@/routes/onboarding/types';

const data = (o: Partial<OnboardingData> = {}): OnboardingData => ({ ...base, ...o });

describe('injuryDateOf', () => {
  it('treats a year alone as a complete answer', () => {
    expect(injuryDateOf(data({ injuryYear: '2013' }))).toEqual({
      date: '2013-01-01',
      precision: 'year',
    });
  });

  it('records month precision when a month is given', () => {
    expect(injuryDateOf(data({ injuryYear: '2013', injuryMonth: '3' }))).toEqual({
      date: '2013-03-01',
      precision: 'month',
    });
  });

  it('records day precision only when a day is given', () => {
    expect(injuryDateOf(data({ injuryYear: '2013', injuryMonth: '3', injuryDay: '4' }))).toEqual({
      date: '2013-03-04',
      precision: 'day',
    });
  });

  it('ignores a day given without a month, rather than inventing one', () => {
    expect(injuryDateOf(data({ injuryYear: '2013', injuryDay: '4' }))).toEqual({
      date: '2013-01-01',
      precision: 'year',
    });
  });

  it('is null without a four-digit year', () => {
    expect(injuryDateOf(data({ injuryYear: '' }))).toBeNull();
    expect(injuryDateOf(data({ injuryYear: '13' }))).toBeNull();
  });
});

describe('canAdvance', () => {
  it('needs a name', () => {
    expect(canAdvance('name', data({ displayName: '  ' }))).toBe(false);
    expect(canAdvance('name', data({ displayName: 'Dana' }))).toBe(true);
  });

  it('needs a username that is valid and has been found free', () => {
    expect(canAdvance('username', data({ username: 'dana', usernameChecked: '' }))).toBe(false);
    expect(canAdvance('username', data({ username: 'dana', usernameChecked: 'dana' }))).toBe(true);
  });

  it('does not count a check made for a name that has since been edited', () => {
    expect(canAdvance('username', data({ username: 'dana2', usernameChecked: 'dana' }))).toBe(
      false,
    );
  });

  it('refuses a username the database would, even if it were marked free', () => {
    for (const bad of ['ab', 'Dana', 'dana smith', '.dana', 'dana.', 'da..na', 'a'.repeat(21)]) {
      expect(canAdvance('username', data({ username: bad, usernameChecked: bad }))).toBe(false);
    }
    for (const good of ['abc', 'a.b_c', 'dana99', 'a'.repeat(20)]) {
      expect(canAdvance('username', data({ username: good, usernameChecked: good }))).toBe(true);
    }
  });

  it('lets the phone for events be empty, but not half a number', () => {
    expect(canAdvance('phone', data())).toBe(true);
    expect(canAdvance('phone', data({ phone: '   ' }))).toBe(true);
    expect(canAdvance('phone', data({ phone: '(408) 555-0112' }))).toBe(true);
    expect(canAdvance('phone', data({ phone: '408555' }))).toBe(false);
  });

  // The date is optional (the owner, 2026-10-15); the kind and its level are not.
  it('needs the kind and a level, and takes the date or no date', () => {
    expect(canAdvance('injury', data({ injuryType: 'quad', exactLevel: 'C6' }))).toBe(true);
    expect(canAdvance('injury', data({ injuryYear: '2013' }))).toBe(false);
    expect(canAdvance('injury', data({ exactLevel: 'C6', injuryYear: '2013' }))).toBe(false);
    expect(canAdvance('injury', data({ injuryType: 'quad', injuryYear: '2013' }))).toBe(false);
    expect(
      canAdvance('injury', data({ injuryType: 'quad', exactLevel: 'C6', injuryYear: '2013' })),
    ).toBe(true);
    // "Do not know" is a level answer.
    expect(canAdvance('injury', data({ injuryType: 'low_para', exactLevel: 'Do not know' }))).toBe(
      true,
    );
  });

  it('holds the step for a date half typed', () => {
    expect(
      canAdvance('injury', data({ injuryType: 'quad', exactLevel: 'C6', injuryMonth: '6' })),
    ).toBe(false);
  });

  it('takes a relative with nothing more', () => {
    expect(canAdvance('injury', data({ injuryType: 'family' }))).toBe(true);
  });

  it('takes a condition by its name, with or without a level', () => {
    const condition = { injuryType: 'condition' as const, injuryYear: '2013' };
    expect(canAdvance('injury', data({ ...condition, conditionName: '  ' }))).toBe(false);
    expect(canAdvance('injury', data({ ...condition, conditionName: 'Transverse myelitis' }))).toBe(
      true,
    );
    expect(
      canAdvance('injury', data({ ...condition, conditionName: 'Spina bifida', exactLevel: 'L4' })),
    ).toBe(true);
  });

  it('lets the whole step be declined instead', () => {
    expect(canAdvance('injury', data({ declined: ['exactLevel', 'injuryDate'] }))).toBe(true);
  });

  it('lets the photo step through without a photo — it is the optional one', () => {
    expect(canAdvance('photo', data())).toBe(true);
  });

  it('does not require a city, because "somewhere else" is a real answer', () => {
    expect(canAdvance('city', data({ city: '', state: 'CA' }))).toBe(true);
  });

  it('does require a state, which is the coarsest thing we always want', () => {
    expect(canAdvance('city', data({ city: 'San Jose', state: '' }))).toBe(false);
  });
});

describe('the age gate', () => {
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };

  it('will not advance past the birthday step for somebody under 18', () => {
    expect(canAdvance('birthday', data({ birthDate: yearsAgo(17) }))).toBe(false);
  });

  it('advances for an adult', () => {
    expect(canAdvance('birthday', data({ birthDate: yearsAgo(30) }))).toBe(true);
  });

  it('still refuses a malformed date', () => {
    expect(canAdvance('birthday', data({ birthDate: 'nonsense' }))).toBe(false);
    expect(canAdvance('birthday', data({ birthDate: '' }))).toBe(false);
  });
});

describe('stepNumber', () => {
  it('numbers the seven questions, in order', () => {
    expect(
      ['name', 'username', 'birthday', 'injury', 'city', 'phone', 'photo'].map((s) =>
        stepNumber(s as Step),
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('does not number the doors or the agree step', () => {
    for (const door of [
      'welcome',
      'signin',
      'forgot',
      'join',
      'check-email',
      'checking',
      'agree',
    ]) {
      expect(stepNumber(door as Step)).toBeNull();
    }
  });
});

describe('declining the injury step', () => {
  // Until now the only way past a question somebody did not want to answer was
  // "Finish later", which abandons the rest of the wizard — a much bigger thing
  // than declining one page. Declining is an answer here as it is in the
  // survey, so the step is satisfied by either.
  it('lets somebody past without a level or a date', () => {
    expect(canAdvance('injury', data())).toBe(false);
    expect(canAdvance('injury', data({ declined: ['exactLevel', 'injuryDate'] }))).toBe(true);
  });

  it('is satisfied by declining the kind, not by declining the date alone', () => {
    // The date can be left empty now, so declining the kind is enough on its own.
    expect(canAdvance('injury', data({ declined: ['exactLevel'] }))).toBe(true);
    expect(canAdvance('injury', data({ declined: ['injuryDate'] }))).toBe(false);
  });

  it('reports whether the whole step is declined', () => {
    expect(injuryStepDeclined(data())).toBe(false);
    expect(injuryStepDeclined(data({ declined: ['exactLevel'] }))).toBe(false);
    expect(injuryStepDeclined(data({ declined: ['exactLevel', 'injuryDate'] }))).toBe(true);
  });

  it('takes the decline back when pressed again, and leaves others alone', () => {
    const declined = data({ declined: ['photo', 'exactLevel', 'injuryDate'] });
    expect(withInjuryDeclined(declined, false)).toEqual(['photo']);
  });

  it('does not record the same key twice', () => {
    const already = data({ declined: ['exactLevel'] });
    expect(withInjuryDeclined(already, true)).toEqual(['exactLevel', 'injuryDate']);
  });

  // 'Do not know' is already on the completeness list as a real answer, and the
  // same reasoning that keeps it out of missingDetails keeps it out of here.
  it('says nothing about completeness', () => {
    expect(withInjuryDeclined(data(), true)).not.toContain('completeness');
  });
});
