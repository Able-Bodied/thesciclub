import { describe, expect, it } from 'vitest';
import { appleHealth, daysBetween, defaultExpiry, todayIso } from '@/routes/admin/sign-in-health';
import { appleSummary } from '@/routes/admin/sign-in-section';

describe('whether Apple sign-in works', () => {
  it('is active when switched on and more than 30 days from the date', () => {
    const health = appleHealth(true, '2027-04-09', '2026-10-10');
    expect(health.state).toBe('active');
    expect(health.daysLeft).toBe(181);
    expect(appleSummary(health)).toBe(
      'Apple sign-in works. Its secret runs out on April 9, 2027, in 181 days.',
    );
  });

  it('asks for renewal in the last 30 days', () => {
    expect(appleHealth(true, '2027-04-09', '2027-03-10').state).toBe('renew-soon');
    expect(appleHealth(true, '2027-04-09', '2027-03-09').state).toBe('active');
    expect(appleSummary(appleHealth(true, '2027-04-09', '2027-04-08'))).toContain(
      'runs out in 1 day, on April 9, 2027',
    );
  });

  it('is inactive on the date itself and after it', () => {
    expect(appleHealth(true, '2027-04-09', '2027-04-09').state).toBe('inactive');
    const after = appleHealth(true, '2027-04-09', '2027-04-20');
    expect(after.state).toBe('inactive');
    expect(appleSummary(after)).toBe(
      'Apple sign-in has stopped working: its secret ran out on April 9, 2027.',
    );
  });

  it('is inactive when switched off, however far off the date is', () => {
    const off = appleHealth(false, '2027-04-09', '2026-10-10');
    expect(off.state).toBe('inactive');
    expect(appleSummary(off)).toBe('Apple sign-in is switched off in Supabase.');
  });

  it('says it could not check, rather than guessing', () => {
    expect(appleHealth(null, '2027-04-09', '2026-10-10').state).toBe('unknown');
    expect(appleHealth(true, null, '2026-10-10').state).toBe('unknown');
  });
});

describe('dates', () => {
  it('counts whole days across a clock change', () => {
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
    expect(daysBetween('2027-03-13', '2027-03-15')).toBe(2);
  });

  it('offers six months less a day as the new date', () => {
    expect(defaultExpiry('2026-10-10')).toBe('2027-04-08');
  });

  it('takes today in California, where the owner is', () => {
    expect(todayIso(new Date('2026-10-11T05:00:00Z'))).toBe('2026-10-10');
  });
});
