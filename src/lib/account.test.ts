import { describe, expect, it } from 'vitest';
import { statusFor } from '@/lib/account';

describe('what a member row means', () => {
  it('an active row is a member', () => {
    expect(statusFor({ status: 'active' })).toBe('member');
  });

  // The bug this replaces: the status was never selected, so every row read
  // as an ordinary member and a suspended person walked into a club that
  // showed them nothing and explained nothing.
  it('a suspended row is not', () => {
    expect(statusFor({ status: 'suspended' })).toBe('suspended');
  });

  it('nor is a removed one', () => {
    expect(statusFor({ status: 'removed' })).toBe('suspended');
  });

  it('no row at all is somebody part-way through signing up', () => {
    expect(statusFor(null)).toBe('signed-up');
    expect(statusFor(undefined)).toBe('signed-up');
  });

  // The client types selected columns as `any`, so a row can arrive with the
  // column missing — from a stale view, or a select that forgot it. Treating
  // that as active would restore the original bug silently.
  it('treats a row with no status as not active, rather than assuming', () => {
    expect(statusFor({})).toBe('suspended');
  });
});
