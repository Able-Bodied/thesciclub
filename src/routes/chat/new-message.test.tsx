import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Threads from '@/lib/chat/threads';
import type * as Members from '@/lib/members';
import { makeMember } from '@/test/factory';
import type { BrowseMember } from '@/types/domain';

const db = vi.hoisted(() => ({
  members: [] as BrowseMember[],
  opened: [] as string[],
  failure: null as string | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Me' }),
}));
vi.mock('@/lib/members', async (importOriginal) => ({
  ...(await importOriginal<typeof Members>()),
  useBrowseMembers: () => ({ members: db.members, loading: false, error: null, signedOut: false }),
}));
vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  openDirect: (memberId: string) => {
    db.opened.push(memberId);
    return Promise.resolve(
      db.failure ? { ok: false, error: db.failure } : { ok: true, value: `thread-${memberId}` },
    );
  },
}));
vi.mock('@/components/member-avatar', () => ({ MemberAvatar: () => null }));

const { default: NewMessagePage } = await import('@/routes/chat/new-message');

function Where() {
  const location = useLocation();
  return <p>at {location.pathname}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/chat/new']}>
      <Routes>
        <Route path="/chat/new" element={<NewMessagePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.members = [
    makeMember({ id: 'me', displayName: 'Me' }),
    makeMember({ id: 'jan', displayName: 'Jan' }),
    makeMember({ id: 'sam', displayName: 'Sam' }),
  ];
  db.opened = [];
  db.failure = null;
});

describe('starting a conversation from Chat', () => {
  it('offers everybody but the reader', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Message Jan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message Sam' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Message Me' })).toBeNull();
  });

  it('narrows by name, and says so when nobody matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('textbox', { name: 'To' }), 'ja');
    expect(screen.getByRole('button', { name: 'Message Jan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Message Sam' })).toBeNull();
    await user.clear(screen.getByRole('textbox', { name: 'To' }));
    await user.type(screen.getByRole('textbox', { name: 'To' }), 'zz');
    expect(screen.getByText('Nobody here is called “zz”.')).toBeInTheDocument();
  });

  it('opens the conversation with the person tapped', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Message Jan' }));
    expect(db.opened).toEqual(['jan']);
    expect(await screen.findByText('at /chat/t/thread-jan')).toBeInTheDocument();
  });

  it('says why when it cannot, and stays', async () => {
    const user = userEvent.setup();
    db.failure = 'The conversation was not opened.';
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Message Jan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The conversation was not opened.');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Message Jan' })).toBeEnabled();
    });
  });

  it('offers a group instead', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Start a group instead' })).toHaveAttribute(
      'href',
      '/chat/new-group',
    );
  });
});
