import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PartnerLabel } from '@/components/partner-label';
import type * as ClubPartners from '@/lib/club-partners';

vi.mock('@/lib/club-partners', async (importOriginal) => ({
  ...(await importOriginal<typeof ClubPartners>()),
  usePartnerTitles: () =>
    new Map<string, string | null>([
      ['p1', 'Physical therapist, SCI-FIT'],
      ['p2', null],
    ]),
}));

describe('the verified professional label', () => {
  it('names the role and their profession, with the mark', () => {
    const { container } = render(<PartnerLabel memberId="p1" />);
    expect(
      screen.getByText('Verified professional · Physical therapist, SCI-FIT'),
    ).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  // The owner, 2026-11-04: they write it on Me once made one.
  it('names the role alone until they write their profession', () => {
    const { container } = render(<PartnerLabel memberId="p2" />);
    expect(screen.getByText('Verified professional')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows nothing for anybody else', () => {
    const { container } = render(<PartnerLabel memberId="m2" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing without a member', () => {
    const { container } = render(<PartnerLabel memberId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
