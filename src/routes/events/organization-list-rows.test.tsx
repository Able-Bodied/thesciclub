import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type * as Grants from '@/lib/grants';
import type { ClubEvent, Organization } from '@/types/domain';

const grantsByOrg = vi.hoisted(() => ({ map: new Map<string, Grants.Grant[]>() }));
vi.mock('@/lib/grants', async (importOriginal) => ({
  ...(await importOriginal<typeof Grants>()),
  useGrantsByOrganization: () => grantsByOrg.map,
}));

const { OrganizationList } = await import('@/routes/events/organization-list');

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

describe('searching and filtering the directory', () => {
  const year = new Date().getFullYear();
  const fund = (open: boolean): Grants.Grant => ({
    id: 'g',
    name: 'Fund',
    url: 'https://example.org',
    summary: '',
    applyAnyTime: false,
    windows: open
      ? [{ opensOn: `${year - 1}-01-01`, closesOn: `${year + 1}-12-31`, yearly: false }]
      : [],
  });

  it('finds an organization by any word of its name or place', async () => {
    grantsByOrg.map = new Map();
    const user = userEvent.setup();
    renderList(new Set());
    await user.type(screen.getByRole('searchbox', { name: 'Search organizations' }), 'norcal');
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Adaptive Rec Hub')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('1 organization matches.');
  });

  it('keeps only those with grants, or with one open now, and says so on the row', async () => {
    grantsByOrg.map = new Map([
      ['ncs', [fund(true)]],
      ['arh', [fund(false)]],
    ]);
    const user = userEvent.setup();
    renderList(new Set());
    expect(screen.getByText('Grant applications open')).toBeInTheDocument();
    expect(screen.getByText('Gives a grant')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grants open now' }));
    expect(screen.getByRole('button', { name: 'Grants open now' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.queryByText('Adaptive Rec Hub')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByText('Adaptive Rec Hub')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    grantsByOrg.map = new Map();
    const user = userEvent.setup();
    renderList(new Set());
    await user.click(screen.getByRole('button', { name: 'Has grants' }));
    expect(screen.getByRole('status')).toHaveTextContent('No organizations match.');
  });
});
