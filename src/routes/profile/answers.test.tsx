import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';

const account = vi.hoisted(() => ({ current: null as Account | null }));
const api = vi.hoisted(() => ({
  answers: {},
  declined: new Set<string>(),
}));

vi.mock('@/lib/account', () => ({ useAccount: () => account.current }));
vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () =>
    Promise.resolve({ ok: true as const, answers: api.answers, declined: api.declined }),
}));

const { default: ProfileAnswersPage } = await import('@/routes/profile/answers');

function renderAnswers() {
  return render(
    <MemoryRouter initialEntries={['/profile/answers']}>
      <Routes>
        <Route path="/profile/answers" element={<ProfileAnswersPage />} />
        <Route path="/join" element={<p>Welcome screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  account.current = { status: 'member', userId: 'u1', isAdmin: false, displayName: 'Nicole' };
  api.answers = {};
  api.declined = new Set();
});

describe('Your answers', () => {
  it('sends a non-member away', async () => {
    account.current = { status: 'signed-out', userId: null, isAdmin: false, displayName: null };
    renderAnswers();
    expect(await screen.findByText('Welcome screen')).toBeInTheDocument();
  });

  it('shows every screen with what was said on it', async () => {
    api.answers = { gender: 'Woman', languages: ['English', 'Spanish'], bio: 'Rugby on Tuesdays.' };
    api.declined = new Set(['howInjured']);
    renderAnswers();
    await screen.findByRole('heading', { name: 'Your answers' });
    const about = await screen.findByRole('region', { name: 'About you' });
    expect(within(about).getByText('English, Spanish')).toBeInTheDocument();
    expect(
      within(section('In your own words')).getByText('Rugby on Tuesdays.'),
    ).toBeInTheDocument();
    expect(within(section('How it happened')).getByText('Rather not say')).toBeInTheDocument();
    expect(within(section('Work')).getByText('Not answered yet')).toBeInTheDocument();
  });

  it('opens the survey on the screen a Change is for', async () => {
    renderAnswers();
    const family = await screen.findByRole('region', { name: 'Family' });
    expect(within(family).getByRole('link', { name: 'Change Family' })).toHaveAttribute(
      'href',
      '/profile?screen=4',
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

  it('offers to carry on from the first screen still open', async () => {
    api.answers = { gender: 'Woman', languages: ['English'] };
    renderAnswers();
    expect(
      await screen.findByRole('link', { name: 'Carry on where you left off' }),
    ).toHaveAttribute('href', '/profile?screen=1');
  });
});
