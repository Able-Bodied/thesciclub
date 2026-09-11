import { describe, expect, it } from 'vitest';
import {
  INITIAL_ONBOARDING_DATA as base,
  canAdvance,
  injuryDateOf,
  type OnboardingData,
  stepNumber,
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
    expect(canAdvance('injury', data({ levelRange: 'C5–C8' }))).toBe(false);
    expect(canAdvance('injury', data({ injuryYear: '2013' }))).toBe(false);
    expect(canAdvance('injury', data({ levelRange: 'C5–C8', injuryYear: '2013' }))).toBe(true);
  });

  it('lets the photo step through without a photo — it is the optional one', () => {
    expect(canAdvance('photo', data())).toBe(true);
  });

  it('does not require a city, because "somewhere else" is a real answer', () => {
    expect(canAdvance('city', data({ city: '', state: 'CA' }))).toBe(true);
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
