import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StandingCard, standingFor } from '@/routes/me/standing';
import type { MyStrike } from '@/routes/me/standing-api';

function strike(o: Partial<MyStrike> = {}): MyStrike {
  return {
    id: 's1',
    reason: 'Sold supplements in a room',
    issuedAt: new Date().toISOString(),
    withdrawnAt: null,
    withdrawnReason: null,
    ...o,
  };
}

/** `months` ago, as an ISO string. */
function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

describe('what the card says', () => {
  it('reads Good standing when there is nothing against you', () => {
    render(<StandingCard invitedBy="NorCal SCI" strikes={[]} />);
    expect(screen.getByText('Good standing')).toBeInTheDocument();
    expect(screen.getByText(/Membership can be lost/)).toBeInTheDocument();
  });

  it('names the reason, not just the count', () => {
    // Being told you are on a strike without being told what for is the thing
    // that makes somebody leave quietly rather than correct course.
    render(<StandingCard invitedBy={null} strikes={[strike()]} />);
    expect(screen.getByText('One strike')).toBeInTheDocument();
    expect(screen.getByText('Sold supplements in a room')).toBeInTheDocument();
  });

  it('says plainly what the second one means', () => {
    render(
      <StandingCard
        invitedBy={null}
        strikes={[strike({ id: 'a' }), strike({ id: 'b', reason: 'Repeated a room' })]}
      />,
    );
    expect(screen.getByText('Two strikes')).toBeInTheDocument();
    expect(screen.getByText('One more ends your membership.')).toBeInTheDocument();
  });

  it('does not claim somebody has been removed, because nothing removes them', () => {
    // Three strikes flags; an administrator still presses Remove. Saying "you
    // have been removed" on a screen they are still reading would be untrue.
    render(
      <StandingCard
        invitedBy={null}
        strikes={[strike({ id: 'a' }), strike({ id: 'b' }), strike({ id: 'c' })]}
      />,
    );
    expect(screen.getByText(/under review/i)).toBeInTheDocument();
    expect(screen.queryByText(/have been removed/i)).not.toBeInTheDocument();
  });

  it('leaves out a withdrawn strike, and one that has aged out', () => {
    // Both are on the record and an administrator can see them. A member
    // reading where they stand today is owed what counts today.
    render(
      <StandingCard
        invitedBy={null}
        strikes={[
          strike({ id: 'gone', reason: 'Withdrawn one', withdrawnAt: new Date().toISOString() }),
          strike({ id: 'old', reason: 'Ancient one', issuedAt: monthsAgo(13) }),
        ]}
      />,
    );
    expect(screen.getByText('Good standing')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn one')).not.toBeInTheDocument();
    expect(screen.queryByText('Ancient one')).not.toBeInTheDocument();
  });

  it('says nothing about strikes before they have loaded', () => {
    // Null, not an empty array: "Good standing" flashed at somebody on two and
    // then corrected itself would be the worst possible moment to be wrong.
    render(<StandingCard invitedBy={null} strikes={null} />);
    expect(screen.getByText('Good standing')).toBeInTheDocument();
  });
});

describe('standingFor', () => {
  it('escalates, and stops escalating past three', () => {
    expect(standingFor(0).title).toBe('Good standing');
    expect(standingFor(1).title).toBe('One strike');
    expect(standingFor(2).title).toBe('Two strikes');
    expect(standingFor(3).title).toMatch(/under review/i);
    expect(standingFor(9).title).toMatch(/under review/i);
  });
});
