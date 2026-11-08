import { describe, expect, it } from 'vitest';
import { mayLinkFamily } from '@/lib/family';

const as = (injuryType: string | null, type = 'peer') => ({ type, injuryType });

// The owner, 2026-11-07; private.may_link_family says the same.
describe('who may ask to link family', () => {
  it('lets a relative or spouse ask anyone', () => {
    for (const them of [as('quad'), as(null), as('professional'), as('family')]) {
      expect(mayLinkFamily(as('family'), them)).toBe(true);
    }
  });

  it('lets any other member ask only a relative or spouse', () => {
    expect(mayLinkFamily(as('quad'), as('family'))).toBe(true);
    expect(mayLinkFamily(as(null), as('family'))).toBe(true);
    expect(mayLinkFamily(as('quad'), as('low_para'))).toBe(false);
    expect(mayLinkFamily(as(null), as(null))).toBe(false);
  });

  it('never lets a professional ask, nor anyone link an organization account', () => {
    expect(mayLinkFamily(as('professional'), as('family'))).toBe(false);
    expect(mayLinkFamily(as('family'), as(null, 'organization'))).toBe(false);
    expect(mayLinkFamily(as('family', 'organization'), as('family'))).toBe(false);
  });
});
