import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OwnMember } from '@/lib/members';

vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { MeHero } = await import('@/routes/me/hero');

const member: OwnMember = {
  id: 'u1',
  displayName: 'Nicole',
  username: 'nicole.s',
  type: 'peer',
  photoPath: null,
  photoAlt: null,
  city: 'Santa Clara',
  state: 'CA',
  levelRange: 'T1–T6',
  exactLevel: 'T4',
  birthDate: '1984-06-21',
  createdAt: '2026-09-01T00:00:00.000Z',
  isAdmin: false,
  wantsToMentor: null,
};

describe('the hero', () => {
  it('shows the @username under the name', () => {
    render(<MeHero member={member} />);
    expect(screen.getByText('@nicole.s')).toBeInTheDocument();
  });

  it('draws nothing for a member without one', () => {
    render(<MeHero member={{ ...member, username: null }} />);
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });
});
