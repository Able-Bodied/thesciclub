import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextProfileAsk, ProfileCard, useProfileAsk } from '@/routes/home/profile-card';
import type { Answers } from '@/routes/profile/questions';

const read = vi.hoisted(() => ({
  answers: {},
  declined: new Set<string>(),
  photo: false,
}));

vi.mock('@/routes/profile/profile-api', () => ({
  loadAnswers: () => Promise.resolve({ ok: true, answers: read.answers, declined: read.declined }),
  hasPhoto: () => Promise.resolve(read.photo),
}));

function Harness() {
  const { ask, notNow } = useProfileAsk('me');
  return ask ? <ProfileCard ask={ask} onNotNow={notNow} /> : <p>No card</p>;
}

const show = () =>
  render(
    <MemoryRouter>
      <ul>
        <Harness />
      </ul>
    </MemoryRouter>,
  );

beforeEach(() => {
  window.localStorage.clear();
  read.answers = {};
  read.declined = new Set();
  read.photo = false;
});

describe('nextProfileAsk', () => {
  const none = new Set<string>();

  it('asks for a picture, then interests, then the rest', () => {
    expect(nextProfileAsk({}, none, false)?.kind).toBe('photo');
    expect(nextProfileAsk({}, none, true)?.kind).toBe('interests');
    const answers: Answers = { interests: ['Travel'] };
    expect(nextProfileAsk(answers, none, true)?.kind).toBe('rest');
  });

  it('takes declining as an answer', () => {
    expect(nextProfileAsk({}, new Set(['photo']), false)?.kind).toBe('interests');
    expect(nextProfileAsk({}, new Set(['interests']), true)?.kind).toBe('rest');
  });
});

describe('the profile card', () => {
  it('links the interests to that one screen', async () => {
    read.photo = true;
    show();
    const link = await screen.findByRole('link', { name: 'Choose interests' });
    expect(link.getAttribute('href')).toMatch(/^\/profile\?screen=\d+$/);
  });

  it('stays away for a while after Not now', async () => {
    const first = show();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.getByText('No card')).toBeInTheDocument();
    first.unmount();
    show();
    await waitFor(() => {
      expect(screen.getByText('No card')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps asking for a picture on each visit, but the rest only once a week', async () => {
    const picture = show();
    await screen.findByRole('link', { name: 'Add a picture' });
    picture.unmount();
    show();
    expect(await screen.findByRole('link', { name: 'Add a picture' })).toBeInTheDocument();
  });

  it('shows a later question once, then rests', async () => {
    read.photo = true;
    read.answers = { interests: ['Travel'] };
    const first = show();
    await screen.findByRole('link', { name: 'Answer' });
    first.unmount();
    show();
    await waitFor(() => {
      expect(screen.getByText('No card')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Answer' })).toBeNull();
  });
});
