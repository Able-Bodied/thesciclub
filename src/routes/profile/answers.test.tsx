import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import type * as DetailsApi from '@/routes/profile/details-api';
import { SCREENS } from '@/routes/profile/questions';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const api = vi.hoisted(() => ({
  answers: {},
  declined: new Set<string>(),
  city: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/components/app-nav', () => ({ AppNav: () => null }));
vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () =>
    Promise.resolve({ ok: true as const, answers: api.answers, declined: api.declined }),
}));

vi.mock('@/routes/profile/details-api', async (actual) => ({
  ...(await actual<typeof DetailsApi>()),
  loadDetails: () =>
    Promise.resolve({
      ok: true as const,
      details: {
        displayName: 'Nicole Ray',
        birthDate: '1998-04-02',
        injuryType: 'quad',
        exactLevel: 'C6',
        conditionName: '',
        injuryDate: '2015-01-01',
        injuryDatePrecision: 'year',
        city: api.city,
        state: 'CA',
        zip: '',
        photoPath: null,
        declined: ['photo'],
      },
    }),
}));

const { default: ProfileAnswersPage } = await import('@/routes/profile/answers');

function renderAnswers() {
  return render(
    <MemoryRouter initialEntries={['/profile/answers']}>
      <Routes>
        <Route path="/profile/answers" element={<ProfileAnswersPage />} />
        <Route path="/join" element={<p>Welcome screen</p>} />
        <Route path="/profile/next" element={<p>Next step</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  api.answers = {};
  api.declined = new Set();
  api.city = null;
});

describe('Your answers', () => {
  it('sends a non-member away', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    renderAnswers();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });

  // The owner, 2026-11-12: one list, details first, then the questions.
  it('lists the details and every screen with what was said, in one list', async () => {
    api.answers = { gender: 'Woman', languages: ['English', 'Spanish'], bio: 'Rugby on Tuesdays.' };
    api.declined = new Set(['howInjured']);
    renderAnswers();
    await screen.findByRole('heading', { name: 'Your profile' });
    expect(
      within(await screen.findByRole('region', { name: 'Photo' })).getByText('Rather not say'),
    ).toBeInTheDocument();
    const injury = section('Injury or condition');
    expect(within(injury).getByText('C6')).toBeInTheDocument();
    expect(
      within(injury).getByRole('link', { name: 'Change Injury or condition' }),
    ).toHaveAttribute('href', '/profile/details?part=injury');
    expect(within(section('Where you live')).getByText('CA')).toBeInTheDocument();
    expect(within(section('About you')).getByText('English, Spanish')).toBeInTheDocument();
    expect(within(section('Brief bio')).getByText('Rugby on Tuesdays.')).toBeInTheDocument();
    expect(within(section('How it began')).getByText('Rather not say')).toBeInTheDocument();
    // The owner, 2026-11-15: an empty answer is a link to give it.
    expect(
      within(section('Work')).getAllByRole('link', { name: /^Answer now/ })[0],
    ).toHaveAttribute('href', `/profile?screen=${SCREENS.findIndex((s) => s.title === 'Work')}`);
    expect(within(section('Your details')).getByText('4 of 5 done')).toBeInTheDocument();
  });

  it('opens just that screen for a Change', async () => {
    api.answers = { gender: 'Woman' };
    renderAnswers();
    const family = await screen.findByRole('region', { name: 'Family' });
    expect(within(family).getAllByRole('link', { name: /^Answer now/ })[0]).toHaveAttribute(
      'href',
      `/profile?screen=${SCREENS.findIndex((s) => s.title === 'Family')}`,
    );
  });

  // "Before or after your injury?" about children is asked only of somebody
  // who has them.
  it('leaves out a question that does not apply', async () => {
    api.answers = { hasChildren: false };
    renderAnswers();
    const family = await screen.findByRole('region', { name: 'Family' });
    expect(within(family).queryByText('Before or after your injury?')).toBeNull();
  });

  it('includes it once it does', async () => {
    api.answers = { hasChildren: true };
    renderAnswers();
    const family = await screen.findByRole('region', { name: 'Family' });
    expect(within(family).getByText('Before or after your injury?')).toBeInTheDocument();
  });

  it('picks up where it was left: a detail first, then the questions', async () => {
    api.answers = { gender: 'Woman', languages: ['English'] };
    const first = renderAnswers();
    // On the row it is about, carrying on from there (the owner, 2026-11-15).
    const place = await screen.findByRole('region', { name: 'Where you live' });
    expect(within(place).getByText('Recommended next: Add where you live')).toBeInTheDocument();
    expect(within(place).getByRole('link', { name: 'Add now' })).toHaveAttribute(
      'href',
      '/profile/details?part=place&walk=1',
    );
    first.unmount();
    api.city = 'Santa Clara';
    renderAnswers();
    expect(
      await screen.findByText(`Recommended next: Answer “${SCREENS[1]?.title}”`),
    ).toBeInTheDocument();
  });
});
