import { describe, expect, it, vi } from 'vitest';
import { type Deps, inviteSignup } from './handler';

function deps(
  overrides: { address?: string | null; admits?: boolean; invited?: boolean; made?: boolean } = {},
) {
  const { address = 'sam@example.com', admits = true, invited = false, made = true } = overrides;
  return {
    inviteAddress: vi.fn(() => Promise.resolve(address)),
    codeAdmits: vi.fn(() => Promise.resolve(admits)),
    invited: vi.fn(() => Promise.resolve(invited)),
    createConfirmedUser: vi.fn(() => Promise.resolve(made)),
  } satisfies Deps;
}

const body = { email: 'Sam@Example.com ', password: 'long enough' };
const byInvite = { ...body, token: 'tok' };
const byCode = { ...body, code: 'abc' };

describe('with an invite link', () => {
  it('makes the account for the address the invite was sent to', async () => {
    const d = deps();
    expect(await inviteSignup(byInvite, d)).toEqual({ created: true });
    expect(d.createConfirmedUser).toHaveBeenCalledWith('sam@example.com', 'long enough', {
      invite_token: 'tok',
    });
  });

  it('trusts them with another address too', async () => {
    const d = deps();
    const other = { ...byInvite, email: 'other@example.com' };
    expect(await inviteSignup(other, d)).toEqual({ created: true });
    expect(d.createConfirmedUser).toHaveBeenCalledWith('other@example.com', 'long enough', {
      invite_token: 'tok',
    });
  });

  it('does not take the address of somebody else with a pending invite', async () => {
    const d = deps({ invited: true });
    const other = { ...byInvite, email: 'other@example.com' };
    expect(await inviteSignup(other, d)).toEqual({ created: false });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it('refuses a link that is used, unknown or revoked', async () => {
    const d = deps({ address: null });
    expect(await inviteSignup(byInvite, d)).toEqual({ created: false });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });
});

describe('with a code', () => {
  it('makes the account while the code lets people in', async () => {
    const d = deps();
    expect(await inviteSignup(byCode, d)).toEqual({ created: true });
    expect(d.createConfirmedUser).toHaveBeenCalledWith('sam@example.com', 'long enough', {
      qr_code: 'abc',
    });
  });

  it('refuses a code that is off, expired or only gives credit', async () => {
    const d = deps({ admits: false });
    expect(await inviteSignup(byCode, d)).toEqual({ created: false });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it('does not take the place of somebody with a pending invite', async () => {
    const d = deps({ invited: true });
    expect(await inviteSignup(byCode, d)).toEqual({ created: false });
    expect(d.createConfirmedUser).not.toHaveBeenCalled();
  });

  it('is used when the invite link is no longer any good', async () => {
    const d = deps({ address: null });
    expect(await inviteSignup({ ...byInvite, code: 'abc' }, d)).toEqual({ created: true });
  });
});

it('refuses a short password, and anything not a sign-up', async () => {
  const d = deps();
  expect(await inviteSignup({ ...byCode, password: 'short' }, d)).toEqual({ created: false });
  expect(await inviteSignup(null, d)).toEqual({ created: false });
  expect(await inviteSignup({ email: 1 }, d)).toEqual({ created: false });
  expect(await inviteSignup(body, d)).toEqual({ created: false });
  expect(d.createConfirmedUser).not.toHaveBeenCalled();
});

it('says no more than false when the account is refused', async () => {
  expect(await inviteSignup(byInvite, deps({ made: false }))).toEqual({ created: false });
});
