import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Grants from '@/lib/grants';

const db = vi.hoisted(() => ({
  grants: [] as Grants.Grant[],
  saved: [] as { grantId: string | null; draft: Grants.GrantDraft }[],
  removed: [] as string[],
  refusal: null as string | null,
}));
vi.mock('@/lib/grants', async (importOriginal) => ({
  ...(await importOriginal<typeof Grants>()),
  loadOrganizationGrants: () => Promise.resolve({ grants: db.grants, error: null }),
  saveGrant: (_org: string, grantId: string | null, draft: Grants.GrantDraft) => {
    if (db.refusal) return Promise.resolve({ ok: false, error: db.refusal });
    db.saved.push({ grantId, draft });
    return Promise.resolve({ ok: true, id: grantId ?? 'new' });
  },
  removeGrant: (id: string) => {
    db.removed.push(id);
    db.grants = db.grants.filter((g) => g.id !== id);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => () => undefined }));

const { OrganizationGrantsEditor } = await import('@/routes/admin/organization-grants-editor');

const fund: Grants.Grant = {
  id: 'g1',
  name: 'Active Fund',
  url: 'https://kbf.org/theactivefund/',
  summary: 'Equipment.',
  applyAnyTime: false,
  windows: [],
};

beforeEach(() => {
  db.grants = [{ ...fund }];
  db.saved = [];
  db.removed = [];
  db.refusal = null;
});

const editor = () =>
  render(
    <OrganizationGrantsEditor organizationId="kbf" organizationName="Kelly Brush Foundation" />,
  );

describe('the grants editor', () => {
  it('lists each grant with when to apply', async () => {
    editor();
    expect(await screen.findByText('Active Fund')).toBeInTheDocument();
    expect(screen.getByText('No dates for the next round')).toBeInTheDocument();
  });

  it('adds a round to a grant, every year on its days', async () => {
    const user = userEvent.setup();
    editor();
    await user.click(await screen.findByRole('button', { name: 'Edit Active Fund' }));
    await user.click(screen.getByRole('button', { name: 'Add a round' }));
    const round = screen.getByRole('group', { name: 'Round 1' });
    const opens = within(round).getByLabelText('Opens');
    const closes = within(round).getByLabelText('Closes');
    await user.clear(opens);
    await user.type(opens, '2027-02-01');
    await user.clear(closes);
    await user.type(closes, '2027-04-01');
    await user.click(within(round).getByLabelText('Every year on these days'));
    await user.click(screen.getByRole('button', { name: 'Save grant' }));
    await waitFor(() => {
      expect(db.saved).toHaveLength(1);
    });
    expect(db.saved[0]?.grantId).toBe('g1');
    expect(db.saved[0]?.draft.name).toBe('Active Fund');
    expect(db.saved[0]?.draft.windows).toEqual([
      { opensOn: '2027-02-01', closesOn: '2027-04-01', yearly: true },
    ]);
  });

  it('keeps the form and says why when the database refuses', async () => {
    db.refusal = 'A round cannot close before it opens.';
    const user = userEvent.setup();
    editor();
    await user.click(await screen.findByRole('button', { name: 'Add a grant' }));
    await user.type(screen.getByLabelText('Name'), 'New fund');
    await user.type(screen.getByLabelText(/^Link/), 'example.org/fund');
    await user.click(screen.getByRole('button', { name: 'Save grant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A round cannot close before it opens.',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('New fund');
  });

  it('asks before removing a grant', async () => {
    const user = userEvent.setup();
    editor();
    await user.click(await screen.findByRole('button', { name: 'Remove Active Fund' }));
    expect(db.removed).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(db.removed).toEqual(['g1']);
    });
    expect(await screen.findByText('No grants yet.')).toBeInTheDocument();
  });
});
