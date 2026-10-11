import { describe, expect, it } from 'vitest';
import { longDate, reminderEmail } from './compose.ts';

describe('the sign-in reminder', () => {
  it('counts down before the date', () => {
    const email = reminderEmail({ provider: 'apple', expires_on: '2027-04-09', days_left: 30 });
    expect(email.subject).toBe('Sign in with Apple stops working in 30 days');
    expect(email.text).toContain('runs out on April 9, 2027');
    expect(email.text).toContain('node scripts/apple-secret.mjs');
  });

  it('says one day, and the day itself, plainly', () => {
    expect(
      reminderEmail({ provider: 'apple', expires_on: '2027-04-09', days_left: 1 }).subject,
    ).toBe('Sign in with Apple stops working in 1 day');
    expect(
      reminderEmail({ provider: 'apple', expires_on: '2027-04-09', days_left: 0 }).subject,
    ).toBe('Sign in with Apple stops working today');
  });

  it('says it has stopped once the date has passed', () => {
    const email = reminderEmail({ provider: 'apple', expires_on: '2027-04-09', days_left: -2 });
    expect(email.subject).toBe('Sign in with Apple has stopped working: renew it now');
    expect(email.text).toContain('ran out on April 9, 2027');
  });

  it('reads the date the same in every time zone', () => {
    expect(longDate('2027-01-01')).toBe('January 1, 2027');
  });
});
