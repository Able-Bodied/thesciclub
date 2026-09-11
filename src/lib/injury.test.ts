import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  injuryDateLabel,
  isAdult,
  isNewlyInjured,
  latestAdultBirthDate,
  timeSinceLabel,
  yearsSinceInjury,
} from '@/lib/injury';

const NOW = new Date('2026-09-11T00:00:00Z');
const dated = (injuryDate: string | null, p: 'day' | 'month' | 'year' | null = 'day') => ({
  injuryDate,
  injuryDatePrecision: p,
});

describe('yearsSinceInjury', () => {
  it('computes years from the date, so it cannot go stale', () => {
    expect(yearsSinceInjury(dated('2016-09-11'), NOW)).toBeCloseTo(10, 1);
  });

  it('is null when no date was given', () => {
    expect(yearsSinceInjury(dated(null, null), NOW)).toBeNull();
  });

  it('clamps a future date to zero rather than returning a negative', () => {
    expect(yearsSinceInjury(dated('2030-01-01'), NOW)).toBe(0);
  });
});

describe('isNewlyInjured', () => {
  it('is true under a year', () => {
    expect(isNewlyInjured(dated('2026-03-01'), NOW)).toBe(true);
  });

  it('is false over a year', () => {
    expect(isNewlyInjured(dated('2020-01-01'), NOW)).toBe(false);
  });

  it('is null — not false — when unknown, because those differ', () => {
    expect(isNewlyInjured(dated(null, null), NOW)).toBeNull();
  });
});

describe('injuryDateLabel', () => {
  it('shows only the year when only a year was given', () => {
    expect(injuryDateLabel(dated('2013-01-01', 'year'))).toBe('2013');
  });

  it('shows month and year at month precision', () => {
    expect(injuryDateLabel(dated('2013-03-01', 'month'))).toBe('March 2013');
  });

  it('shows the full date only at day precision', () => {
    expect(injuryDateLabel(dated('2013-03-04', 'day'))).toBe('March 4, 2013');
  });

  it('says nothing without a date', () => {
    expect(injuryDateLabel(dated(null, null))).toBeNull();
  });
});

describe('timeSinceLabel', () => {
  it('counts months in the first year', () => {
    expect(timeSinceLabel(dated('2026-06-11'), NOW)).toBe('3 months post-injury');
  });

  it('counts whole years after that', () => {
    expect(timeSinceLabel(dated('2023-09-11'), NOW)).toBe('3 years post-injury');
  });

  it('uses the singular for one year', () => {
    expect(timeSinceLabel(dated('2025-09-11'), NOW)).toBe('1 year post-injury');
  });

  it('is null when there is no date to say it from', () => {
    expect(timeSinceLabel(dated(null, null), NOW)).toBeNull();
  });
});

describe('ageFrom', () => {
  it('derives age from a birth date', () => {
    expect(ageFrom('1996-01-01', NOW)).toBe(30);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFrom('1996-12-31', NOW)).toBe(29);
  });

  it('is null without a birth date', () => {
    expect(ageFrom(null, NOW)).toBeNull();
  });
});

describe('the anniversary edge case', () => {
  it('reads "1 year" on the day itself, not "12 months"', () => {
    expect(timeSinceLabel(dated('2025-09-11'), NOW)).toBe('1 year post-injury');
  });

  it('is no longer newly injured on the anniversary', () => {
    expect(isNewlyInjured(dated('2025-09-11'), NOW)).toBe(false);
  });

  it('is still newly injured the day before', () => {
    expect(isNewlyInjured(dated('2025-09-12'), NOW)).toBe(true);
  });
});

describe('the age gate', () => {
  it('admits somebody exactly eighteen today', () => {
    expect(isAdult('2008-09-11', NOW)).toBe(true);
  });

  it('refuses somebody who turns eighteen tomorrow', () => {
    expect(isAdult('2008-09-12', NOW)).toBe(false);
  });

  it('refuses a missing date rather than letting it through', () => {
    expect(isAdult(null, NOW)).toBe(false);
    expect(isAdult('', NOW)).toBe(false);
  });

  it('computes the cut-off date rather than hard-coding a year', () => {
    expect(latestAdultBirthDate(NOW)).toBe('2008-09-11');
  });
});
