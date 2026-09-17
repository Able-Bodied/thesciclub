import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type { MemberDetails } from '@/routes/profile/details-api';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const api = vi.hoisted(() => ({
  details: null as MemberDetails | null,
  saves: [] as { details: MemberDetails; levelRange: string }[],
  failWith: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/routes/profile/details-api', () => ({
  loadDetails: () =>
    Promise.resolve(
      api.details
        ? { ok: true as const, details: api.details }
        : { ok: false as const, error: 'Your profile could not be found.' },
    ),
  saveDetails: (_id: string, details: MemberDetails, levelRange: string) => {
    if (api.failWith) return Promise.resolve({ ok: false, error: api.failWith });
    api.saves.push({ details, levelRange });
    return Promise.resolve({ ok: true });
  },
  savePhoto: () => Promise.resolve({ ok: true as const, path: 'u1/profile.jpg' }),
  removePhoto: () => Promise.resolve({ ok: true }),
}));

const { default: ProfileDetailsPage } = await import('@/routes/profile/details');

const details = (o: Partial<MemberDetails> = {}): MemberDetails => ({
  displayName: 'Nicole',
  birthDate: '1998-04-02',
  exactLevel: 'C6',
  completeness: 'Incomplete',
  injuryDate: '2016-01-01',
  injuryDatePrecision: 'year',
  city: 'Santa Clara',
  state: 'CA',
  photoPath: null,
  showInBrowse: true,
  ...o,
});

function renderDetails() {
  return render(
    <MemoryRouter initialEntries={['/profile/details']}>
      <Routes>
        <Route path="/profile/details" element={<ProfileDetailsPage />} />
        <Route path="/me" element={<p>The Me tab</p>} />
        <Route path="/join" element={<p>Welcome screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  api.details = details();
  api.saves = [];
  api.failWith = null;
});

describe('Your details', () => {
  it('sends a non-member away', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    renderDetails();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });

  it('loads what onboarding recorded, so a mistake can be seen', async () => {
    renderDetails();
    expect(await screen.findByLabelText('Name')).toHaveValue('Nicole');
    expect(screen.getByLabelText('Birthday')).toHaveValue('1998-04-02');
    expect(screen.getByLabelText('City or town')).toHaveValue('Santa Clara');
    expect(screen.getByLabelText('Level of injury')).toHaveValue('C6');
  });

  it('saves a corrected name', async () => {
    renderDetails();
    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Nikki');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.details.displayName).toBe('Nikki');
    });
  });

  it('re-derives the browse range from a changed level, so the two cannot come apart', async () => {
    renderDetails();
    await screen.findByLabelText('Level of injury');
    await userEvent.selectOptions(screen.getByLabelText('Level of injury'), 'T10');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.saves[0]?.levelRange).toBe('T7–T12');
    });
  });

  it('says that members see an age and not the date', async () => {
    renderDetails();
    expect(await screen.findByText(/never the date itself/)).toBeInTheDocument();
  });

  it('warns that editing a year-only injury date records an exact one', async () => {
    renderDetails();
    expect(await screen.findByText(/Changing this records an exact date/)).toBeInTheDocument();
  });

  it('does not carry the deck switch, which lives on Me', async () => {
    // It was here first, four fields down and behind a Save — which is where
    // it was mistaken for part of onboarding. Being findable is a switch, not
    // a form field, so it moved to Me and this page does not offer it twice.
    renderDetails();
    await screen.findByLabelText('Name');
    expect(screen.queryByText(/Show me in the deck/)).not.toBeInTheDocument();
  });

  it('surfaces a save failure rather than claiming it saved', async () => {
    api.failWith = 'permission denied';
    renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('permission denied')).toBeInTheDocument();
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  it('returns to Me once it has saved', async () => {
    renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The Me tab')).toBeInTheDocument();
  });

  it('stays on the page when saving fails, so the field is still there', async () => {
    api.failWith = 'permission denied';
    renderDetails();
    await screen.findByLabelText('Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('permission denied');
    expect(screen.queryByText('The Me tab')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
