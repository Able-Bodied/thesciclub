import { describe, expect, it } from 'vitest';
import { ageFrom, birthdayLabel } from '@/routes/me/hero';

/**
 * A birth date is a calendar date, not an instant. `new Date('1984-06-21')`
 * parses as UTC midnight and renders in local time, so every one of these is a
 * test that the timezone has been kept out of it.
 */
describe('birthdayLabel', () => {
  it('reads the date as written', () => {
    expect(birthdayLabel('1984-06-21')).toBe('21 June');
  });

  it('does not shift a date west of Greenwich', () => {
    // Through `new Date(...)` this renders as 31 December in the Americas.
    expect(birthdayLabel('1984-01-01')).toBe('1 January');
  });

  it('does not shift the other way either', () => {
    expect(birthdayLabel('1984-12-31')).toBe('31 December');
  });

  it('handles both ends of the year', () => {
    expect(birthdayLabel('1990-02-29')).toBe('29 February');
  });

  it('returns null for something that is not a date', () => {
    expect(birthdayLabel('')).toBeNull();
    expect(birthdayLabel('not a date')).toBeNull();
  });
});

describe('ageFrom', () => {
  it('counts whole years', () => {
    expect(ageFrom('1984-06-21', new Date(2026, 8, 11))).toBe(42);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFrom('1984-12-25', new Date(2026, 8, 11))).toBe(41);
  });

  it('counts it on the day itself', () => {
    // Off by one here means somebody is told the wrong age on their birthday,
    // which is the one day they would notice.
    expect(ageFrom('1984-09-11', new Date(2026, 8, 11))).toBe(42);
  });

  it('does not count it the day before', () => {
    expect(ageFrom('1984-09-12', new Date(2026, 8, 11))).toBe(41);
  });

  it('counts it the day after', () => {
    expect(ageFrom('1984-09-10', new Date(2026, 8, 11))).toBe(42);
  });

  it('returns null for junk rather than NaN', () => {
    expect(ageFrom('')).toBeNull();
  });
});
