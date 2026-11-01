import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyOrganizations } from '@/routes/me/organizations';

const state = vi.hoisted(() => ({ following: new Set<string>() }));

vi.mock('@/lib/organization-follows', () => ({
  useOrganizationFollows: () => ({ following: state.following }),
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    byId: new Map([
      ['o1', { id: 'o1', name: 'Zed Club' }],
      ['o2', { id: 'o2', name: 'Abilities' }],
    ]),
  }),
}));
vi.mock('@/routes/events/organization-badge', () => ({ OrganizationBadge: () => null }));

function renderList() {
  render(
    <MemoryRouter>
      <MyOrganizations />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.following = new Set(['o1', 'o2']);
});

describe('your organizations on Me', () => {
  it('starts closed, saying how many', () => {
    renderList();
    const button = screen.getByRole('button', { name: /Your organizations/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('2 organizations');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('opens on a press, by name, each leading to its page, and closes again', async () => {
    renderList();
    const button = screen.getByRole('button', { name: /Your organizations/ });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Abilities',
      'Zed Club',
    ]);
    expect(screen.getByRole('link', { name: 'Abilities' })).toHaveAttribute(
      'href',
      '/events/organizations/o2',
    );
    await userEvent.click(button);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says one organization, not one organizations', () => {
    state.following = new Set(['o1']);
    renderList();
    expect(screen.getByRole('button')).toHaveTextContent('1 organization');
    expect(screen.getByRole('button')).not.toHaveTextContent('1 organizations');
  });

  it('draws nothing with none', () => {
    state.following = new Set();
    renderList();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
