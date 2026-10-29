import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Introductions from '@/lib/introductions';
import type { IntroductionForMe } from '@/lib/introductions';

const state = vi.hoisted(() => ({ fetch: vi.fn(), answer: vi.fn(), announce: vi.fn() }));

vi.mock('@/lib/introductions', async (importOriginal) => ({
  ...(await importOriginal<typeof Introductions>()),
  fetchIntroductionForMe: (...args: unknown[]) => state.fetch(...args) as Promise<unknown>,
  answerIntroduction: (...args: unknown[]) => state.answer(...args) as Promise<unknown>,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => state.announce }));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => [] }));

const { default: IntroductionPage } = await import('@/routes/introductions/page');

const asked: IntroductionForMe = {
  id: 'i1',
  status: 'asked',
  myAnswer: null,
  note: 'You are both C6 and in San Jose.',
  createdAt: '2026-10-29T10:00:00Z',
  threadId: null,
  partner: { id: 'p', name: 'Phoebe Ruiz', photoPath: null, title: 'Physical therapist, SCI-FIT' },
  other: { id: 'maya', name: 'Maya Local', username: 'maya', photoPath: null, photoAlt: null },
};

function show() {
  render(
    <MemoryRouter initialEntries={['/introductions/i1']}>
      <Routes>
        <Route path="/introductions/:id" element={<IntroductionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('an introduction, to one of the two', () => {
  beforeEach(() => {
    state.fetch.mockReset();
    state.answer.mockReset();
    state.announce.mockReset();
  });

  it('shows who introduced them, to whom, and the note', async () => {
    state.fetch.mockResolvedValue({ ok: true, value: asked });
    show();
    expect(await screen.findByRole('link', { name: 'Phoebe Ruiz' })).toHaveAttribute(
      'href',
      '/peers/p',
    );
    expect(screen.getByText(/Physical therapist, SCI-FIT/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Maya Local/ })).toHaveAttribute('href', '/peers/maya');
    expect(screen.getByText('You are both C6 and in San Jose.')).toBeInTheDocument();
    expect(state.fetch).toHaveBeenCalledWith('i1');
  });

  it('after a yes, says it waits for the other, and focuses that', async () => {
    state.fetch
      .mockResolvedValueOnce({ ok: true, value: asked })
      .mockResolvedValueOnce({ ok: true, value: { ...asked, myAnswer: true } });
    state.answer.mockResolvedValue({ ok: true, value: null });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, introduce us' }));
    expect(state.answer).toHaveBeenCalledWith('i1', true);
    const line = await screen.findByText(
      "You said yes. We'll open a conversation when you've both said yes.",
    );
    await waitFor(() => {
      expect(line).toHaveFocus();
    });
    expect(state.announce).toHaveBeenCalledWith('You said yes.');
  });

  it('links to the conversation once both said yes', async () => {
    state.fetch.mockResolvedValue({
      ok: true,
      value: { ...asked, status: 'opened', myAnswer: true, threadId: 't1' },
    });
    show();
    expect(await screen.findByRole('link', { name: 'Open the conversation' })).toHaveAttribute(
      'href',
      '/chat/t/t1',
    );
  });

  it.each([
    ['withdrawn', null, 'Phoebe Ruiz took this introduction back.'],
    ['expired', null, 'This introduction was not answered in time, and has closed.'],
    ['declined', false, 'You said not now.'],
  ] as const)('says when it is %s', async (status, myAnswer, text) => {
    state.fetch.mockResolvedValue({ ok: true, value: { ...asked, status, myAnswer } });
    show();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yes, introduce us' })).not.toBeInTheDocument();
  });

  it('says when there is none to see', async () => {
    state.fetch.mockResolvedValue({ ok: true, value: null });
    show();
    expect(await screen.findByText('This introduction is not there any more.')).toBeInTheDocument();
  });

  it('says a refused answer aloud', async () => {
    state.fetch.mockResolvedValue({ ok: true, value: asked });
    state.answer.mockResolvedValue({
      ok: false,
      error: 'This introduction is no longer waiting for an answer.',
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This introduction is no longer waiting for an answer.',
    );
  });
});
