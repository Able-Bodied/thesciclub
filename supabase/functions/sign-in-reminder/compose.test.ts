import { describe, expect, it } from 'vitest';
import { longDate, reminderEmail } from './compose.ts';

describe('the sign-in reminder', () => {
  it('counts down before the date', () => {
    const email = reminderEmail({ provider: 'apple', expires_on: '2027-04-09', days_left: 30 });
    expect(email.subject).toBe('Sign in with Apple stops working in 30 days');
    expect(email.text).toContain('runs out on April 9, 2027');
    expect(email.text).toContain('node scripts/apple-secret.mjs');
    expect(email.text).toContain('Admin → Keys & renewals → Sign in with Apple secret');
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

describe('the reminder for anything else the club renews', () => {
  const token = {
    provider: null,
    name: 'GitHub token for address lookups',
    purpose: 'Kept in the vault as `geocode_github_token`.',
    steps: ['Make a new token.', 'Run `select vault.update_secret(…);`.'],
    expires_on: '2027-10-26',
    days_left: 30,
  };

  it('names it, says what it is for, and gives its own steps', () => {
    const email = reminderEmail(token);
    expect(email.subject).toBe('GitHub token for address lookups runs out in 30 days');
    expect(email.text).toContain('runs out on October 26, 2027');
    expect(email.text).toContain('Kept in the vault as geocode_github_token.');
    expect(email.text).toContain('1. Make a new token.\n2. Run select vault.update_secret(…);.');
    expect(email.text).toContain('3. The SCI Club → Admin → Keys & renewals');
    expect(email.text).not.toContain('Apple');
  });

  it('says today, and once gone, that it has run out', () => {
    expect(reminderEmail({ ...token, days_left: 0 }).subject).toBe(
      'GitHub token for address lookups runs out today',
    );
    const gone = reminderEmail({ ...token, days_left: -3 });
    expect(gone.subject).toBe('GitHub token for address lookups has run out: renew it now');
    expect(gone.text).toContain('ran out on October 26, 2027');
  });
});
