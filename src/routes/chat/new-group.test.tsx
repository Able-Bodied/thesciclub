import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Groups from '@/lib/chat/groups';
import { makeMember } from '@/test/factory';
import type { BrowseMember } from '@/types/domain';

/**
 * Starting a group.
 *
 * `groupProblem` is deliberately not stubbed — the sentence under the button
 * and the button's own disabled state are the same value, and a test that
 * mocked it would be asserting its own wording. Its own tests are in
 * src/lib/chat/groups.test.ts.
 */

const db = vi.hoisted(() => ({
  members: [] as BrowseMember[],
  created: [] as { name: string; ids: readonly string[] }[],
  failure: null as string | null,
  navigated: [] as string[],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));

vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => ({
    members: db.members,
    loading: false,
    error: null,
    signedOut: false,
  }),
}));

vi.mock('@/lib/chat/groups', async (importOriginal) => ({
  ...(await importOriginal<typeof Groups>()),
  createGroup: (name: string, ids: readonly string[]) => {
    db.created.push({ name, ids });
    return Promise.resolve(
      db.failure ? { ok: false, error: db.failure } : { ok: true, value: 'g-new' },
    );
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => (to: string) => {
    db.navigated.push(to);
  },
}));

const { default: NewGroupPage } = await import('@/routes/chat/new-group');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/chat/new-group']}>
      <NewGroupPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.members = [
    makeMember({ id: 'me', displayName: 'Alex' }),
    makeMember({ id: 'jan', displayName: 'Jan' }),
    makeMember({ id: 'bo', displayName: 'Bo' }),
  ];
  db.created = [];
  db.failure = null;
  db.navigated = [];
});

describe('starting a group', () => {
  it('does not offer the member making it', () => {
    // chat_create_group puts them on the roster without being named, so a tick
    // beside their own name would be one that cannot be cleared.
    renderPage();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.queryByText('Alex')).toBeNull();
  });

  it('will not start until there is a name and somebody in it', async () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Start the group' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Give the group a name.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('What is the group for?'), 'Saturday ride');
    expect(button).toBeDisabled();
    expect(screen.getByText('Pick at least one member.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Jan/ }));
    expect(button).toBeEnabled();
  });

  it('sends the name and the picked members, and goes to the group', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('What is the group for?'), 'Saturday ride');
    await userEvent.click(screen.getByRole('checkbox', { name: /Jan/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Bo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the group' }));

    await waitFor(() => {
      expect(db.created).toEqual([{ name: 'Saturday ride', ids: ['jan', 'bo'] }]);
    });
    expect(db.navigated).toEqual(['/chat/t/g-new']);
  });

  it('keeps the draft when the database refuses, and does not navigate', async () => {
    db.failure = 'One of those members cannot be added to a group.';
    renderPage();
    await userEvent.type(screen.getByLabelText('What is the group for?'), 'Saturday ride');
    await userEvent.click(screen.getByRole('checkbox', { name: /Jan/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Start the group' }));

    expect(
      await screen.findByText(/One of those members cannot be added to a group./),
    ).toBeInTheDocument();
    expect(db.navigated).toEqual([]);
    // The most expensive thing on the page, especially when it was dictated.
    expect(screen.getByLabelText('What is the group for?')).toHaveValue('Saturday ride');
    expect(screen.getByRole('checkbox', { name: /Jan/ })).toBeChecked();
  });

  it('narrows the list by name without asking the server anything', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/Who is in it/), 'ja');
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.queryByText('Bo')).toBeNull();
  });
});
