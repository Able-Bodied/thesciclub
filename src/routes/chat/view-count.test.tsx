import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostViewer } from '@/lib/chat/post-viewers';

const fetchPostViewers = vi.hoisted(() => vi.fn<(id: string) => Promise<PostViewer[]>>());
vi.mock('@/lib/chat/post-viewers', () => ({ fetchPostViewers }));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { AccountContext } = await import('@/lib/account-context');
const { ViewCount } = await import('@/routes/chat/view-count');

function renderCount(isAdmin: boolean) {
  render(
    <MemoryRouter>
      <AccountContext.Provider
        value={{ status: 'member', userId: 'me', isAdmin, displayName: 'Me' }}
      >
        <ViewCount count={2} postId="post-1" />
      </AccountContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchPostViewers.mockReset();
});

describe('ViewCount', () => {
  it('is only a count for a member', () => {
    renderCount(false);
    expect(screen.getByText('2 views')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fetchPostViewers).not.toHaveBeenCalled();
  });

  it('opens who viewed, with each device, for an administrator', async () => {
    fetchPostViewers.mockResolvedValue([
      {
        memberId: 'a',
        displayName: 'Ana',
        photoPath: null,
        photoAlt: null,
        seenAt: '2026-10-20T15:00:00Z',
        devices: ['desktop', 'mobile'],
      },
      {
        memberId: 'b',
        displayName: 'Ben',
        photoPath: null,
        photoAlt: null,
        seenAt: null,
        devices: [],
      },
    ]);
    renderCount(true);
    await userEvent.click(screen.getByRole('button', { name: '2 views, see who viewed' }));
    const sheet = screen.getByRole('dialog', { name: 'Who viewed' });
    expect(fetchPostViewers).toHaveBeenCalledWith('post-1');
    expect(await within(sheet).findByRole('link', { name: 'Ana' })).toHaveAttribute(
      'href',
      '/peers/a',
    );
    expect(within(sheet).getByText(/^Desktop and Mobile · /)).toBeInTheDocument();
    expect(within(sheet).getByText('Device not recorded')).toBeInTheDocument();
    expect(
      within(sheet).getByText('2 people. Only administrators can see this.'),
    ).toBeInTheDocument();
  });

  it('says so when the list cannot load', async () => {
    fetchPostViewers.mockRejectedValue(new Error('nope'));
    renderCount(true);
    await userEvent.click(screen.getByRole('button', { name: '2 views, see who viewed' }));
    expect(await screen.findByText('Could not load who viewed this post.')).toBeInTheDocument();
  });
});
