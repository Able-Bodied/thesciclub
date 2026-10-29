import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PartnerLabel } from '@/components/partner-label';
import type * as ClubPartners from '@/lib/club-partners';

vi.mock('@/lib/club-partners', async (importOriginal) => ({
  ...(await importOriginal<typeof ClubPartners>()),
  usePartnerTitles: () => new Map([['p1', 'Physical therapist, SCI-FIT']]),
}));

describe('the club partner label', () => {
  it('names the role and their title', () => {
    render(<PartnerLabel memberId="p1" />);
    expect(screen.getByText('Club partner · Physical therapist, SCI-FIT')).toBeInTheDocument();
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
