import { describe, expect, it } from 'vitest';
import {
  INITIAL_ONBOARDING_DATA as base,
  canAdvance,
  injuryDateOf,
  injuryStepDeclined,
  type OnboardingData,
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
  it('needs ten digits of phone, however they are punctuated', () => {
    expect(canAdvance('phone', data({ phone: '(408) 555-0112' }))).toBe(true);
    expect(canAdvance('phone', data({ phone: '408555' }))).toBe(false);
  });

  it('needs exactly six digits of code', () => {
    expect(canAdvance('code', data({ code: '111111' }))).toBe(true);
    expect(canAdvance('code', data({ code: '11111' }))).toBe(false);
  });

  it('needs a level and a year before the injury step is done', () => {
    expect(canAdvance('injury', data({ exactLevel: 'C6' }))).toBe(false);
    expect(canAdvance('injury', data({ injuryYear: '2013' }))).toBe(false);
    expect(canAdvance('injury', data({ exactLevel: 'C6', injuryYear: '2013' }))).toBe(true);
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
  it('numbers only the five counted steps', () => {
    expect(stepNumber('name')).toBe(1);
    expect(stepNumber('photo')).toBe(5);
  });

  it('does not number the conditional steps', () => {
    expect(stepNumber('claim')).toBeNull();
    expect(stepNumber('phone')).toBeNull();
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

  it('is not satisfied by declining only half of it', () => {
    expect(canAdvance('injury', data({ declined: ['exactLevel'] }))).toBe(false);
    expect(canAdvance('injury', data({ declined: ['exactLevel'], injuryYear: '2013' }))).toBe(true);
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
