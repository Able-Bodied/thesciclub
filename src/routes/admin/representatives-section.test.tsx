import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminMember } from '@/routes/admin/members-admin';
import { RepresentativesSection } from '@/routes/admin/representatives-section';

const db = vi.hoisted(() => ({
  found: [] as Partial<AdminMember>[],
  asked: [] as unknown[],
  added: [] as [string, string][],
  failure: null as string | null,
  /** When set, a search waits for this before answering. */
  hold: null as Promise<void> | null,
}));

vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: [{ id: 'o1', name: 'Abilities' }],
    byId: new Map(),
    loading: false,
  }),
}));
vi.mock('@/lib/organization-representatives', () => ({
  fetchRepresentatives: () => Promise.resolve({ ok: true, representatives: [] }),
  addRepresentative: (organizationId: string, memberId: string) => {
    db.added.push([organizationId, memberId]);
    return Promise.resolve({ ok: true });
  },
  removeRepresentative: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/routes/admin/members-admin', () => ({
  fetchMemberPage: async (args: { query: string }) => {
    db.asked.push(args);
    if (db.hold) await db.hold;
    return db.failure
      ? { ok: false, error: db.failure }
      : { ok: true, members: db.found, total: db.found.length };
  },
}));

const maya: Partial<AdminMember> = {
  id: 'maya',
  displayName: 'Maya Local',
  username: 'maya.local',
  city: 'San Jose',
  state: 'CA',
};

beforeEach(() => {
  db.found = [maya];
  db.asked = [];
  db.added = [];
  db.failure = null;
  db.hold = null;
});

async function search(words: string) {
  await userEvent.type(screen.getByRole('searchbox', { name: 'Find a member' }), words);
}

describe('making somebody an org admin', () => {
  it('suggests nobody before anything is typed, and reads nothing', async () => {
    render(<RepresentativesSection />);
    await screen.findByText(/No org admins yet/);
    expect(screen.queryByRole('list', { name: 'Members' })).toBeNull();
    expect(db.asked).toEqual([]);
  });

  it('suggests members under the box as a name is typed', async () => {
    render(<RepresentativesSection />);
    await search('maya');
    expect(await screen.findByRole('button', { name: /Maya Local/ })).toHaveTextContent(
      '@maya.local · San Jose, CA',
    );
  });

  it('asks for what was typed, an @ included, in the active members', async () => {
    render(<RepresentativesSection />);
    await search('@maya');
    await screen.findByRole('button', { name: /Maya Local/ });
    expect(db.asked.at(-1)).toMatchObject({ query: '@maya', filter: 'active' });
  });

  it('says when nobody matches', async () => {
    db.found = [];
    render(<RepresentativesSection />);
    await search('zz');
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
  });

  it('says when the search failed, rather than showing nothing', async () => {
    db.failure = 'Could not load the members.';
    render(<RepresentativesSection />);
    await search('maya');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the members.');
  });

  it('chooses one on a press, and makes them org admin', async () => {
    render(<RepresentativesSection />);
    const go = screen.getByRole('button', { name: 'Make org admin' });
    await userEvent.selectOptions(screen.getByLabelText('Organization'), 'o1');
    await search('maya');
    expect(go).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: /Maya Local/ }));
    expect(screen.queryByRole('searchbox', { name: 'Find a member' })).toBeNull();
    await userEvent.click(go);
    await waitFor(() => {
      expect(db.added).toEqual([['o1', 'maya']]);
    });
    expect(await screen.findByRole('searchbox', { name: 'Find a member' })).toHaveValue('');
  });

  it('lets a choice be changed', async () => {
    render(<RepresentativesSection />);
    await search('maya');
    await userEvent.click(await screen.findByRole('button', { name: /Maya Local/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Change from Maya Local' }));
    expect(screen.getByRole('searchbox', { name: 'Find a member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make org admin' })).toBeDisabled();
  });

  it('shows no answer to older words', async () => {
    let answer: () => void = () => undefined;
    db.hold = new Promise((resolve) => {
      answer = () => {
        resolve();
      };
    });
    render(<RepresentativesSection />);
    await search('ma');
    await waitFor(
      () => {
        expect(db.asked).toHaveLength(1);
      },
      { timeout: 1000 },
    );
    await search('ya');
    db.found = [];
    answer();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button', { name: /Maya Local/ })).toBeNull();
  });
});
