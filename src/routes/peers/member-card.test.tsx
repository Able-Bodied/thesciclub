import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as Organizations from '@/lib/organizations';
import type { Organization } from '@/types/domain';

const orgs = vi.hoisted(() => ({ list: [] as Organization[] }));
// Partial: `organizationByName` is pure and the card should be running the
// real one. Without any mock the hook reaches for Supabase and throws inside
// the render, which would leave the badge silently on its fallback.
vi.mock('@/lib/organizations', async (importOriginal) => ({
  ...(await importOriginal<typeof Organizations>()),
  useOrganizations: () => ({ organizations: orgs.list, loading: false }),
}));

const { gradientFor, initialsOf, MemberCard, summaryLine } = await import(
  '@/routes/peers/member-card'
);
const { makeMember } = await import('@/test/factory');

const norcal = {
  id: 'o1',
  shortCode: 'NCS',
  name: 'NorCal SCI',
  city: 'Northern California',
  description: '',
  tags: [],
  canInvite: true,
  logoPath: 'organizations/ncs.webp',
} as Organization;

describe('summaryLine', () => {
  it('prefers the exact level over the range once somebody has given one', () => {
    const m = makeMember({ exactLevel: 'C6', levelRange: 'C5–C8', completeness: 'Incomplete' });
    expect(summaryLine(m)).toContain('C6 incomplete');
  });

  it('falls back to the range when no exact level was given', () => {
    const m = makeMember({ exactLevel: null, levelRange: 'C5–C8', completeness: 'Complete' });
    expect(summaryLine(m)).toContain('C5–C8 complete');
  });

  it('omits completeness entirely when it is unknown, rather than saying "do not know"', () => {
    const m = makeMember({ exactLevel: 'T4', completeness: 'Do not know' });
    expect(summaryLine(m)).not.toContain('do not know');
    expect(summaryLine(m)).toContain('T4');
  });

  it('drops missing parts instead of leaving a gap between separators', () => {
    const m = makeMember({ exactLevel: 'T4', completeness: 'Complete', age: null, city: null });
    expect(summaryLine(m)).toBe('T4 complete');
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Bob Spisak')).toBe('BS');
  });

  it('handles a single name', () => {
    expect(initialsOf('Ajay')).toBe('A');
  });

  it('never renders empty', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('gradientFor', () => {
  it('is stable for the same member, so a tile does not change colour between renders', () => {
    expect(gradientFor('abc')).toEqual(gradientFor('abc'));
  });
});

describe('MemberCard', () => {
  it('shows the name and the summary', () => {
    render(
      <MemberCard
        member={makeMember({
          displayName: 'Nicole',
          exactLevel: 'C6',
          completeness: 'Incomplete',
          age: 28,
          city: 'Santa Clara',
        })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('Nicole')).toBeInTheDocument();
    expect(screen.getByText('C6 incomplete · 28 · Santa Clara')).toBeInTheDocument();
  });

  it('flags a mentor, so they are recognisable while scrolling', () => {
    render(<MemberCard member={makeMember({ type: 'mentor' })} onOpen={() => undefined} />);
    expect(screen.getByText('Mentor')).toBeInTheDocument();
  });

  it('does not flag a peer', () => {
    render(<MemberCard member={makeMember({ type: 'peer' })} onOpen={() => undefined} />);
    expect(screen.queryByText('Mentor')).not.toBeInTheDocument();
  });

  it('marks the vouching organization, which is separate information from being a mentor', () => {
    render(
      <MemberCard
        member={makeMember({ type: 'mentor', affiliations: ['NorCal SCI'] })}
        onOpen={() => undefined}
      />,
    );
    // The mark is what is drawn; the name is there for a screen reader, since
    // the badge itself is aria-hidden. Both are asserted so neither can go
    // missing quietly.
    expect(screen.getByText('NS')).toBeInTheDocument();
    expect(screen.getByText('NorCal SCI')).toHaveClass('sr-only');
  });

  it('shows every affiliation, not just the first', () => {
    // The bug this pins: `affiliations[0]` meant one organization per card, and
    // because NorCal SCI is first for every member in the directory, the whole
    // deck showed the same organization and six others never appeared.
    orgs.list = [norcal];
    render(
      <MemberCard
        member={makeMember({ affiliations: ['NorCal SCI', 'Canine Companions'] })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('NCS')).toBeInTheDocument();
    expect(screen.getByText('CC')).toBeInTheDocument();
    expect(screen.getByText('NorCal SCI, Canine Companions')).toHaveClass('sr-only');
  });

  it('counts affiliations past the third rather than drawing them', () => {
    render(
      <MemberCard
        member={makeMember({ affiliations: ['One Two', 'Three Four', 'Five Six', 'Seven Eight'] })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
    // The name still reaches a screen reader even when the mark is not drawn.
    expect(screen.getByText(/Seven Eight/)).toHaveClass('sr-only');
  });

  it('shows an affiliation for a peer too — it is not a mentor-only badge', () => {
    render(
      <MemberCard
        member={makeMember({ type: 'peer', affiliations: ['ReCARES'] })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('ReCARES')).toHaveClass('sr-only');
    expect(screen.getByText('REC')).toBeInTheDocument();
  });

  it('shows at most three topics', () => {
    render(
      <MemberCard
        member={makeMember({ topics: ['One', 'Two', 'Three', 'Four'] })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('Three')).toBeInTheDocument();
    expect(screen.queryByText('Four')).not.toBeInTheDocument();
  });

  it('renders the initials tile when there is no photo', () => {
    const { container } = render(
      <MemberCard
        member={makeMember({ displayName: 'Vicki', photoPath: null })}
        onOpen={() => undefined}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('V')).toBeInTheDocument();
  });
});

describe('the official account', () => {
  it('is badged Official and named, without a level or an age', () => {
    render(
      <MemberCard
        member={makeMember({ displayName: 'admin', isAdmin: true, exactLevel: 'T4', age: 30 })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('Official')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    // A level and an age would be fiction on an account that is not a person.
    expect(screen.queryByText(/T4/)).not.toBeInTheDocument();
    expect(screen.queryByText(/· 30 ·/)).not.toBeInTheDocument();
  });

  it('uses the club mark rather than a photograph', () => {
    render(
      <MemberCard
        member={makeMember({ isAdmin: true, photoPath: 'seed/x.webp' })}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByRole('img', { name: 'The SCI Club' })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('does not badge an ordinary member as official', () => {
    render(<MemberCard member={makeMember({ isAdmin: false })} onOpen={() => undefined} />);
    expect(screen.queryByText('Official')).not.toBeInTheDocument();
  });
});

describe('the organization on a card', () => {
  it('shows the organization’s logo where the club has a row for it', () => {
    orgs.list = [norcal];
    render(
      <MemberCard member={makeMember({ affiliations: ['NorCal SCI'] })} onOpen={() => undefined} />,
    );
    const logo = document.querySelector('img[src*="organizations/ncs.webp"]');
    expect(logo).not.toBeNull();
    expect(screen.getByText('NorCal SCI')).toHaveClass('sr-only');
  });

  // Several affiliations name a body the club has no organization row for.
  // They still have to render.
  it('falls back to initials for an affiliation the club does not know', () => {
    orgs.list = [norcal];
    render(
      <MemberCard
        member={makeMember({ affiliations: ['Rotary Club of Aptos'] })}
        onOpen={() => undefined}
      />,
    );
    expect(document.querySelector('img[src*="organizations"]')).toBeNull();
    expect(screen.getByText('Rotary Club of Aptos')).toHaveClass('sr-only');
  });
});
