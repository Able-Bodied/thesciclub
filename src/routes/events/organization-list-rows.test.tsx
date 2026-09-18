import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationList } from '@/routes/events/organization-list';
import type { ClubEvent, Organization } from '@/types/domain';

function org(id: string, name: string): Organization {
  return {
    id,
    name,
    shortCode: name.slice(0, 2).toUpperCase(),
    city: 'San Jose',
    description: '',
    tags: [],
    logoPath: null,
    canInvite: false,
  };
}

const organizations = [org('ncs', 'NorCal SCI'), org('arh', 'Adaptive Rec Hub')];

function renderList(following: Set<string>, handlers: Partial<{ open: () => void }> = {}) {
  const onToggleFollow = vi.fn();
  const onOpen = vi.fn(handlers.open);
  render(
    <OrganizationList
      organizations={organizations}
      events={[] as ClubEvent[]}
      following={following}
      onToggleFollow={onToggleFollow}
      onOpen={onOpen}
    />,
  );
  return { onToggleFollow, onOpen };
}

describe('the organizations directory', () => {
  it('offers a follow on every row, in the state the viewer is in', () => {
    renderList(new Set(['ncs']));
    expect(
      screen.getByRole('button', { name: 'Following. Press to unfollow.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
  });

  // The row used to be one <button> and Follow cannot live inside one: a button
  // inside a button is invalid HTML and browsers discard the inner one, so the
  // follow would have been a dead region that opened the organization instead.
  // This is that, asserted.
  it('follows without opening the organization', async () => {
    // Only NorCal SCI is unfollowed, so "Follow" names exactly one button. The
    // alternative is indexing into the rows, and the list is sorted by calendar
    // activity — with no events that falls back to alphabetical, so the first
    // row is Adaptive Rec Hub and the assertion would be about the ordering
    // rather than about the button.
    const { onToggleFollow, onOpen } = renderList(new Set(['arh']));
    await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(onToggleFollow).toHaveBeenCalledWith('ncs');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('still opens the organization from the name', async () => {
    const { onToggleFollow, onOpen } = renderList(new Set());
    await userEvent.click(screen.getByText('NorCal SCI'));
    expect(onOpen).toHaveBeenCalledWith('ncs');
    expect(onToggleFollow).not.toHaveBeenCalled();
  });
});
