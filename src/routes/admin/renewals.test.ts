import { describe, expect, it } from 'vitest';
import {
  fromRow,
  type Renewal,
  renewalState,
  renewalsDue,
  sortRenewals,
} from '@/routes/admin/renewals';

const item = (o: Partial<Renewal> = {}): Renewal => ({
  id: 'r1',
  name: 'A key',
  purpose: '',
  steps: [],
  expires: true,
  expiresOn: '2027-10-21',
  signInProvider: null,
  ...o,
});

const TODAY = '2027-09-30';

describe('what state a renewal is in', () => {
  it('is fine until thirty days before, then renew soon, then gone after the day', () => {
    expect(renewalState(item({ expiresOn: '2027-10-31' }), TODAY)).toEqual({
      state: 'ok',
      daysLeft: 31,
    });
    expect(renewalState(item({ expiresOn: '2027-10-30' }), TODAY).state).toBe('renew-soon');
    expect(renewalState(item({ expiresOn: TODAY }), TODAY)).toEqual({
      state: 'renew-soon',
      daysLeft: 0,
    });
    expect(renewalState(item({ expiresOn: '2027-09-28' }), TODAY)).toEqual({
      state: 'expired',
      daysLeft: -2,
    });
  });

  it('tells a date not entered from one that never runs out', () => {
    expect(renewalState(item({ expiresOn: null }), TODAY).state).toBe('no-date');
    expect(renewalState(item({ expires: false, expiresOn: null }), TODAY).state).toBe('no-expiry');
  });
});

describe('the order', () => {
  it('puts the soonest first, the gone ones before them, then no date, then no expiry', () => {
    const sorted = sortRenewals([
      item({ id: 'never', expires: false, expiresOn: null }),
      item({ id: 'undated', expiresOn: null }),
      item({ id: 'later', expiresOn: '2028-01-01' }),
      item({ id: 'gone', expiresOn: '2027-01-01' }),
      item({ id: 'soon', expiresOn: '2027-10-05' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['gone', 'soon', 'later', 'undated', 'never']);
  });

  it('counts what wants renewing now, for the tab', () => {
    expect(
      renewalsDue(
        [
          item({ expiresOn: '2027-01-01' }),
          item({ expiresOn: '2027-10-05' }),
          item({ expiresOn: '2028-01-01' }),
          item({ expiresOn: null }),
        ],
        TODAY,
      ),
    ).toBe(2);
    expect(renewalsDue(null, TODAY)).toBe(0);
  });
});

describe('a row from the database', () => {
  const row = {
    id: 'r1',
    name: 'Sign in with Apple secret',
    purpose: null,
    steps: null,
    expires: true,
    expires_on: null,
    sign_in_provider: 'apple',
    sign_in_secrets: { expires_on: '2027-04-09' },
  };

  it('takes the Apple secret’s date from sign_in_secrets, where it lives', () => {
    expect(fromRow(row)).toMatchObject({
      expiresOn: '2027-04-09',
      purpose: '',
      steps: [],
      signInProvider: 'apple',
    });
    expect(fromRow({ ...row, sign_in_secrets: [{ expires_on: '2027-05-01' }] }).expiresOn).toBe(
      '2027-05-01',
    );
  });

  it('takes its own date otherwise', () => {
    expect(
      fromRow({ ...row, sign_in_provider: null, sign_in_secrets: null, expires_on: '2027-10-26' })
        .expiresOn,
    ).toBe('2027-10-26');
  });
});
