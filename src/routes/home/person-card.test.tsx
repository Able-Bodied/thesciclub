import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PersonCard } from '@/routes/home/person-card';
import { makeMember } from '@/test/factory';

function renderCard(member = makeMember()) {
  return render(
    <MemoryRouter>
      <PersonCard member={member} linkState={{ from: 'home' }} />
    </MemoryRouter>,
  );
}

describe('a member worth meeting', () => {
  it('is one link, named for the member, to their profile', () => {
    renderCard(makeMember({ id: 'sam', displayName: 'Sam Okafor' }));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Sam Okafor');
    expect(links[0]).toHaveAttribute('href', '/peers/sam');
  });

  it('says who they are and what they do', () => {
    renderCard(
      makeMember({
        exactLevel: 'C6',
        completeness: 'Incomplete',
        age: 34,
        city: 'Oakland',
        fieldOfWork: 'Occupational therapy',
      }),
    );
    expect(screen.getByText('Worth meeting')).toBeInTheDocument();
    expect(screen.getByText('C6 incomplete · 34 · Oakland')).toBeInTheDocument();
    expect(screen.getByText('Occupational therapy')).toBeInTheDocument();
  });

  // Grouped the way the Peers filter groups them, three at most.
  it('lists up to three things they will talk about, grouped', () => {
    renderCard(
      makeMember({
        topics: [
          'Bowel programme',
          'Bladder management',
          'Back to work',
          'Handcycling',
          'Pressure sores',
        ],
      }),
    );
    const chips = within(screen.getByRole('list', { name: 'Happy to talk about' })).getAllByRole(
      'listitem',
    );
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent('Bladder and bowel');
  });

  it('draws no list when they named nothing', () => {
    renderCard(makeMember({ topics: [] }));
    expect(screen.queryByRole('list')).toBeNull();
  });
});
