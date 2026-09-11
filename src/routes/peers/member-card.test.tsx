import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gradientFor, initialsOf, MemberCard, summaryLine } from '@/routes/peers/member-card';
import { makeMember } from '@/test/factory';

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

  it('badges a mentor', () => {
    render(<MemberCard member={makeMember({ type: 'mentor' })} onOpen={() => undefined} />);
    expect(screen.getByText('Peer mentor')).toBeInTheDocument();
  });

  it('does not badge a peer', () => {
    render(<MemberCard member={makeMember({ type: 'peer' })} onOpen={() => undefined} />);
    expect(screen.queryByText('Peer mentor')).not.toBeInTheDocument();
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
