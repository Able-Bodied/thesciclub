import { describe, expect, it } from 'vitest';
import {
  canWithdraw,
  describeFailure,
  inviteState,
  liveCount,
  MENTOR_ALLOWANCE,
  type MentorInvite,
  slotsLeft,
} from '@/routes/invites/mentor-invites';

const invite = (o: Partial<MentorInvite> = {}): MentorInvite => ({
  id: 'i1',
  phone: '14085550112',
  status: 'pending',
  note: null,
  createdAt: '2026-09-11T08:43:18Z',
  ...o,
});

describe('the allowance', () => {
  // The counting rule is the database's, in live_invite_count(): pending and
  // consumed both spend a slot. If this drifts from the SQL the screen offers
  // a slot the insert policy then refuses, which is the confusing failure.
  // Written against MENTOR_ALLOWANCE rather than the figure, because these
  // tests were pinned to 2 and every one of them failed when the owner raised
  // it to 10 — which taught nothing about the counting rule, only that a
  // number had moved. What matters is the arithmetic; the figure is the
  // database's to say.
  it('spends a slot on somebody who has joined, not just on one still waiting', () => {
    const invites = [invite({ status: 'pending' }), invite({ status: 'consumed' })];
    expect(liveCount(invites)).toBe(2);
    expect(slotsLeft(invites)).toBe(MENTOR_ALLOWANCE - 2);
  });

  it('gives the slot back when an invite is withdrawn', () => {
    const invites = [invite({ status: 'revoked' }), invite({ status: 'pending' })];
    expect(liveCount(invites)).toBe(1);
    expect(slotsLeft(invites)).toBe(MENTOR_ALLOWANCE - 1);
  });

  it('never reports more than the allowance, however many rows there are', () => {
    expect(slotsLeft([])).toBe(MENTOR_ALLOWANCE);
    expect(
      slotsLeft(Array.from({ length: MENTOR_ALLOWANCE + 3 }, () => invite({ status: 'consumed' }))),
    ).toBe(0);
  });
});

describe('what an invite is doing', () => {
  it('distinguishes waiting, joined and withdrawn', () => {
    expect(inviteState(invite({ status: 'pending' }))).toBe('waiting for them to join');
    expect(inviteState(invite({ status: 'consumed' }))).toBe('joined the club');
    expect(inviteState(invite({ status: 'revoked' }))).toBe('withdrawn');
  });

  // The update policy only matches pending rows, so a Withdraw button on
  // anything else is a button the database answers with UPDATE 0 — no error,
  // no change, and nothing on screen to explain it.
  it('offers Withdraw only while nobody is on the number', () => {
    expect(canWithdraw(invite({ status: 'pending' }))).toBe(true);
    expect(canWithdraw(invite({ status: 'consumed' }))).toBe(false);
    expect(canWithdraw(invite({ status: 'revoked' }))).toBe(false);
  });
});

describe('explaining a refusal', () => {
  // These two are the same action failing for different reasons, and which
  // one you get depends on the allowance — see steps 12 and 13 of
  // supabase/tests/mentor-invites.sql. Reading either as the other tells a
  // mentor something false.
  it('names the number, not the allowance, when the number is taken', () => {
    expect(describeFailure('23505', 'duplicate key value violates unique constraint')).toMatch(
      /already on the club’s list/,
    );
  });

  it('names the allowance when the policy refuses', () => {
    expect(describeFailure('42501', 'new row violates row-level security policy')).toMatch(
      new RegExp(`used all ${MENTOR_ALLOWANCE} of your invites`),
    );
  });

  // Anything else is a failure nobody predicted. Inventing a friendly sentence
  // for it would hide the only information there is.
  it('passes an unrecognised failure through in the database’s own words', () => {
    expect(describeFailure('08006', 'connection failure')).toBe('connection failure');
    expect(describeFailure(undefined, 'network error')).toBe('network error');
  });
});
