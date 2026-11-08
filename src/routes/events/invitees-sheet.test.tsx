import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EventVisibility } from '@/lib/event-audience';
import { InviteesSheet } from '@/routes/events/invitees-sheet';

vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => new Map() }));

const visibility: EventVisibility = {
  audience: 'people',
  mayChange: false,
  organizations: [],
  groups: null,
  invitees: [],
  inviteeCount: 0,
  addedBy: null,
  changedBy: [],
};

function sheet(hasCohosts: boolean) {
  render(
    <MemoryRouter>
      <InviteesSheet
        visibility={visibility}
        organizationName="Ability360"
        hasCohosts={hasCohosts}
        readerId={null}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
}

// 20261107150000: a co-host's org admins see a private event too.
describe('who else sees an invite-only event', () => {
  it('names the host’s org admins', () => {
    sheet(false);
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Ability360’s org admins and the club’s administrators can see it too.',
    );
  });

  it('adds its co-hosts’ org admins when it has co-hosts', () => {
    sheet(true);
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Ability360’s and its co-hosts’ org admins and the club’s administrators can see it too.',
    );
  });
});
