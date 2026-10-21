import { describe, expect, it } from 'vitest';
import { californiaToday, cycleOf, type Grant, grantDay, grantStatus } from '@/lib/grants';

// The same cases as supabase/tests/grants.sql steps 1–4, so page and job agree.
describe('cycleOf', () => {
  it('finds this year’s open cycle', () => {
    expect(
      cycleOf({ opensOn: '2000-10-01', closesOn: '2000-11-15', yearly: true }, '2026-10-20'),
    ).toEqual({
      opens: '2026-10-01',
      closes: '2026-11-15',
    });
  });

  it('moves a closed yearly window to next year', () => {
    expect(
      cycleOf({ opensOn: '2000-03-01', closesOn: '2000-04-15', yearly: true }, '2026-10-20'),
    ).toEqual({
      opens: '2027-03-01',
      closes: '2027-04-15',
    });
  });

  it('carries a window across New Year', () => {
    expect(
      cycleOf({ opensOn: '2000-12-01', closesOn: '2000-01-31', yearly: true }, '2027-01-10'),
    ).toEqual({
      opens: '2026-12-01',
      closes: '2027-01-31',
    });
  });

  it('drops a dated window once it has closed', () => {
    expect(
      cycleOf({ opensOn: '2026-01-01', closesOn: '2026-02-01', yearly: false }, '2026-10-20'),
    ).toBeNull();
  });
});

const grant = (over: Partial<Grant>): Grant => ({
  id: 'g',
  name: 'Fund',
  url: 'https://example.org',
  summary: '',
  applyAnyTime: false,
  windows: [],
  ...over,
});

describe('grantStatus', () => {
  it('says open, with the close, while a cycle runs', () => {
    const g = grant({ windows: [{ opensOn: '2000-10-01', closesOn: '2000-11-15', yearly: true }] });
    expect(grantStatus(g, '2026-10-20')).toEqual({ kind: 'open', closes: '2026-11-15' });
  });

  it('picks the sooner of two yearly cycles', () => {
    const g = grant({
      windows: [
        { opensOn: '2000-03-01', closesOn: '2000-04-15', yearly: true },
        { opensOn: '2000-11-01', closesOn: '2000-12-15', yearly: true },
      ],
    });
    expect(grantStatus(g, '2026-10-20')).toEqual({
      kind: 'upcoming',
      opens: '2026-11-01',
      closes: '2026-12-15',
    });
  });

  it('is any time, or unpublished, with no windows', () => {
    expect(grantStatus(grant({ applyAnyTime: true }), '2026-10-20')).toEqual({ kind: 'any_time' });
    expect(grantStatus(grant({}), '2026-10-20')).toEqual({ kind: 'unpublished' });
  });
});

describe('dates', () => {
  it('counts the day in California, not UTC', () => {
    expect(californiaToday(new Date('2026-10-21T03:00:00Z'))).toBe('2026-10-20');
  });

  it('leaves the year off this year and next', () => {
    expect(grantDay('2026-11-15', '2026-10-20')).toBe('Nov 15');
    expect(grantDay('2028-01-31', '2026-10-20')).toBe('Jan 31, 2028');
  });
});
