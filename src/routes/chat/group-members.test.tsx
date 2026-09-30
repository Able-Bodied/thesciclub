import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as Groups from '@/lib/chat/groups';
import type * as Threads from '@/lib/chat/threads';
import type { ChatAuthor, ChatThread } from '@/lib/chat/types';
import { makeMember } from '@/test/factory';
import type { BrowseMember } from '@/types/domain';

/**
 * Who is in a group, adding to it, and leaving it.
 *
 * The one thing this screen must not grow is a way to remove somebody else:
 * the delete policy is own-row-only and there is no function that evicts, so a
 * control for it would be a refusal drawn as a button.
 */

const db = vi.hoisted(() => ({
  threads: [] as ChatThread[],
  roster: [] as string[],
  authors: new Map<string, ChatAuthor>(),
  members: [] as BrowseMember[],
  added: [] as [string, string][],
  addFailure: null as string | null,
  left: [] as [string, string][],
  navigated: [] as string[],
  reloaded: 0,
  threadsReloaded: 0,
  renamed: [] as [string, string][],
  renameFailure: null as string | null,
  pictured: [] as [string, string | null][],
  pictureFailure: null as string | null,
  uploads: [] as [string[], string][],
  deleted: [] as string[][],
  urls: new Map<string, string>(),
}));

// The uploads and signing are storage calls; attachmentProblem is left real,
// since it is what refuses a video before anything is sent.
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  uploadAttachments: (files: File[], folder: string) => {
    db.uploads.push([files.map((f) => f.name), folder]);
    return Promise.resolve({ ok: true, value: files.map((f) => `${folder}/${f.name}`) });
  },
  deleteAttachments: (paths: string[]) => {
    db.deleted.push(paths);
    return Promise.resolve();
  },
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map([...db.urls].filter(([path]) => paths.includes(path))),
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));

vi.mock('@/lib/members', () => ({
  useBrowseMembers: () => ({ members: db.members, loading: false, error: null, signedOut: false }),
}));

vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => db.authors,
}));

vi.mock('@/lib/chat/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof Threads>()),
  useMyThreads: () => ({
    threads: db.threads,
    loading: false,
    error: null,
    reload: () => {
      db.threadsReloaded += 1;
    },
  }),
}));

vi.mock('@/lib/chat/groups', async (importOriginal) => ({
  ...(await importOriginal<typeof Groups>()),
  useThreadRoster: () => ({
    memberIds: db.roster,
    loading: false,
    error: null,
    reload: () => {
      db.reloaded += 1;
    },
  }),
  addToGroup: (threadId: string, memberId: string) => {
    db.added.push([threadId, memberId]);
    return Promise.resolve(
      db.addFailure ? { ok: false, error: db.addFailure } : { ok: true, value: null },
    );
  },
  renameGroup: (threadId: string, name: string) => {
    db.renamed.push([threadId, name]);
    return Promise.resolve(
      db.renameFailure ? { ok: false, error: db.renameFailure } : { ok: true, value: null },
    );
  },
  setGroupPicture: (threadId: string, path: string | null) => {
    db.pictured.push([threadId, path]);
    return Promise.resolve(
      db.pictureFailure ? { ok: false, error: db.pictureFailure } : { ok: true, value: null },
    );
  },
  leaveGroup: (threadId: string, memberId: string) => {
    db.left.push([threadId, memberId]);
    return Promise.resolve({ ok: true, value: null });
  },
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => (to: string) => {
    db.navigated.push(to);
  },
}));

const { default: GroupMembersPage } = await import('@/routes/chat/group-members');

const author = (o: Partial<ChatAuthor> = {}): ChatAuthor => ({
  id: 'jan',
  displayName: 'Jan',
  photoPath: null,
  photoAlt: null,
  avatarColor: null,
  level: 'T4',
  isAdmin: false,
  hasProfile: true,
  ...o,
});

const thread = (o: Partial<ChatThread> = {}): ChatThread => ({
  id: 'g1',
  kind: 'group',
  name: 'Saturday ride',
  eventId: null,
  createdAt: '2026-09-01T10:00:00Z',
  lastMessageAt: '2026-09-01T10:00:00Z',
  memberCount: 3,
  otherMemberId: null,
  lastBody: null,
  lastAuthorId: null,
  lastAt: null,
  lastRemoved: false,
  unread: false,
  photoPath: null,
  lastNotice: null,
  ...o,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/chat/t/g1/members']}>
      <Routes>
        <Route path="/chat/t/:threadId/members" element={<GroupMembersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.threads = [thread()];
  db.roster = ['me', 'jan'];
  db.authors = new Map([
    ['me', author({ id: 'me', displayName: 'Alex' })],
    ['jan', author()],
  ]);
  db.members = [
    makeMember({ id: 'me', displayName: 'Alex' }),
    makeMember({ id: 'jan', displayName: 'Jan' }),
    makeMember({ id: 'bo', displayName: 'Bo' }),
  ];
  db.added = [];
  db.addFailure = null;
  db.left = [];
  db.navigated = [];
  db.reloaded = 0;
  db.threadsReloaded = 0;
  db.renamed = [];
  db.renameFailure = null;
  db.pictured = [];
  db.pictureFailure = null;
  db.uploads = [];
  db.deleted = [];
  db.urls = new Map();
});

describe('who is in a group', () => {
  it('names everybody in it and marks which one is the reader', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '2 members' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jan' })).toHaveAttribute('href', '/peers/jan');
    expect(screen.getByText('— you')).toBeInTheDocument();
  });

  it('offers no way to put anybody else out', () => {
    // There is no function that evicts and the delete policy is own-row-only,
    // so a Remove here would be a refusal drawn as a button.
    renderPage();
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('does not offer to add somebody already in it', () => {
    renderPage();
    expect(screen.queryByRole('checkbox', { name: /Jan/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Bo/ })).toBeInTheDocument();
  });

  it('adds who was picked and reads the roster back', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 member' }));
    await waitFor(() => {
      expect(db.added).toEqual([['g1', 'bo']]);
    });
    // Not spliced in optimistically: the roster the database has is the one
    // this screen is about.
    expect(db.reloaded).toBe(1);
  });

  it('says why an add was refused', async () => {
    db.addFailure = 'That member cannot be added to a group.';
    renderPage();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 member' }));
    expect(await screen.findByText('That member cannot be added to a group.')).toBeInTheDocument();
  });

  it('asks before leaving, and says what leaving costs', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Leave this group' }));
    expect(db.left).toEqual([]);
    expect(screen.getByText(/stop being able to read this conversation/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Leave the group' }));
    await waitFor(() => {
      expect(db.left).toEqual([['g1', 'me']]);
    });
    // Replacing, so the back button does not land on a thread that no longer
    // loads for them.
    expect(db.navigated).toEqual(['/chat']);
  });

  it('lets somebody change their mind about leaving', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Leave this group' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stay in it' }));
    expect(screen.getByRole('button', { name: 'Leave this group' })).toBeInTheDocument();
    expect(db.left).toEqual([]);
  });

  it('adds nobody by hand to an event’s group, and says why', () => {
    db.threads = [thread({ eventId: 'ev1' })];
    renderPage();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/can join from the event/)).toBeInTheDocument();
    // Leaving is still theirs to do.
    expect(screen.getByRole('button', { name: 'Leave this group' })).toBeInTheDocument();
  });

  it('has nothing to manage for a conversation between two people', () => {
    db.threads = [thread({ kind: 'direct', name: null, otherMemberId: 'jan' })];
    renderPage();
    expect(screen.getByText(/no members to manage/)).toBeInTheDocument();
  });
});

const photo = (name: string, type = 'image/jpeg') => new File([new Uint8Array(10)], name, { type });
// The platform's picker behind the button, hidden from the accessibility tree
// on purpose; reached by its type, as the composer's test does.
const fileInput = (): HTMLInputElement => {
  const element = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!element) throw new Error('the screen should carry a file input');
  return element;
};

// The owner, 2026-09-30: anybody in a group can rename it or change its
// picture, an event's group keeps its name and takes no picture, and the
// conversation says who changed what.
describe('a group’s name and picture', () => {
  it('is headed by the group’s name, with the members under it', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Saturday ride' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '2 members' })).toBeInTheDocument();
    expect(screen.getByText(/Anybody in the group can change these/)).toBeInTheDocument();
  });

  it('renames, and reads the group back', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Rename the group' }));
    const field = screen.getByLabelText('The group’s name');
    expect(field).toHaveValue('Saturday ride');
    // The current name is refused by the database, so it is not offered.
    expect(screen.getByRole('button', { name: 'Save the name' })).toBeDisabled();
    expect(screen.getByText('That is already the group’s name.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'Tuesday swimmers');
    await user.click(screen.getByRole('button', { name: 'Save the name' }));
    await waitFor(() => {
      expect(db.renamed).toEqual([['g1', 'Tuesday swimmers']]);
    });
    expect(db.threadsReloaded).toBe(1);
    expect(screen.queryByLabelText('The group’s name')).toBeNull();
  });

  // The control that had focus goes away each time; focus must not fall to
  // the top of the page.
  it('keeps focus in place as the form opens and closes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Rename the group' }));
    expect(screen.getByLabelText('The group’s name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Rename the group' })).toHaveFocus();
  });

  it('keeps what was typed when a rename is refused, and says why', async () => {
    db.renameFailure = 'Only an active member can rename a group.';
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Rename the group' }));
    const field = screen.getByLabelText('The group’s name');
    await user.clear(field);
    await user.type(field, 'Tuesday swimmers');
    await user.click(screen.getByRole('button', { name: 'Save the name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only an active member can rename a group.',
    );
    expect(screen.getByLabelText('The group’s name')).toHaveValue('Tuesday swimmers');
    expect(db.threadsReloaded).toBe(0);
  });

  it('uploads a picture to the group’s own folder, then names it', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole('button', { name: 'Take the picture away' })).toBeNull();
    await user.upload(fileInput(), photo('pool.jpg'));
    await waitFor(() => {
      expect(db.pictured).toEqual([['g1', 'threads/g1/pool.jpg']]);
    });
    expect(db.uploads).toEqual([[['pool.jpg'], 'threads/g1']]);
    expect(db.threadsReloaded).toBe(1);
  });

  it('takes a refused picture back out of storage, and says why', async () => {
    db.pictureFailure = 'That picture has not been uploaded.';
    const user = userEvent.setup();
    renderPage();
    await user.upload(fileInput(), photo('pool.jpg'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That picture has not been uploaded.',
    );
    expect(db.deleted).toEqual([['threads/g1/pool.jpg']]);
  });

  it('refuses something that is not a photograph before sending anything', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await user.upload(fileInput(), photo('clip.mp4', 'video/mp4'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a photograph/);
    expect(db.uploads).toEqual([]);
    expect(db.pictured).toEqual([]);
  });

  it('shows the picture, and offers to change it or take it away', async () => {
    db.urls = new Map([['threads/g1/p.webp', 'https://signed/p']]);
    db.threads = [thread({ photoPath: 'threads/g1/p.webp' })];
    const user = userEvent.setup();
    renderPage();
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://signed/p');
    expect(screen.getByRole('button', { name: /Change the picture/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take the picture away' }));
    await waitFor(() => {
      expect(db.pictured).toEqual([['g1', null]]);
    });
  });

  it('offers neither to an event’s group, which keeps the event’s name', () => {
    db.threads = [thread({ eventId: 'ev1', name: 'Adaptive swim night' })];
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Adaptive swim night' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename the group' })).toBeNull();
    expect(screen.queryByRole('button', { name: /picture/ })).toBeNull();
    expect(screen.getByText(/It keeps the event’s name/)).toBeInTheDocument();
  });
});
