import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Router from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as ChatRooms from '@/lib/chat/rooms';
import type * as Topics from '@/lib/chat/topics';
import type { ChatRoom } from '@/lib/chat/types';
import { makeRoom } from '@/test/factory';

/**
 * Starting a topic, asked from a room or from Home, and sharing a photograph.
 *
 * `topicProblem` and `backToHome` are left real: they are what the button
 * waits for and where Back goes, and a stub of either would let this file
 * assert its own answer. `useChatRooms`, `createTopic` and the uploads are the
 * network and are stubbed.
 */

const db = vi.hoisted(() => ({
  rooms: [] as ChatRoom[],
  created: [] as [string, string, string, string[]][],
  failure: null as string | null,
  uploads: [] as [string[], string][],
  deleted: [] as string[][],
  navigated: [] as [string, unknown][],
}));

vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatRooms>()),
  useChatRooms: () => ({ rooms: db.rooms, loading: false, error: null, reload: () => undefined }),
}));

vi.mock('@/lib/chat/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof Topics>()),
  createTopic: (roomId: string, title: string, body: string, paths: string[] = []) => {
    db.created.push([roomId, title, body, paths]);
    return Promise.resolve(
      db.failure ? { ok: false, error: db.failure } : { ok: true, value: 'topic-1' },
    );
  },
}));

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
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useNavigate: () => (to: string, options?: { state?: unknown }) => {
    db.navigated.push([to, options?.state]);
  },
}));

const { default: NewTopicPage, topicProblem } = await import('@/routes/chat/new-topic');

beforeEach(() => {
  db.rooms = [makeRoom({ id: 'equip', name: 'Equipment & assistive tech', category: 'Kit' })];
  db.created = [];
  db.failure = null;
  db.uploads = [];
  db.deleted = [];
  db.navigated = [];
});

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/chat/rooms/equip/new', state }]}>
      <Routes>
        <Route path="/chat/rooms/:roomId/new" element={<NewTopicPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const photo = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/jpeg' });
// The platform's picker behind the button, hidden from the accessibility tree
// on purpose; reached by its type, as new-room.test.tsx does.
const fileInput = (): HTMLInputElement => {
  const element = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!element) throw new Error('the form should carry a file input');
  return element;
};

const post = () => screen.getByRole('button', { name: 'Post it' });

describe('asking, from a room', () => {
  it('goes back to the room and says New topic', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'New topic' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Equipment & assistive tech' })).toHaveAttribute(
      'href',
      '/chat/rooms/equip',
    );
  });

  it('still needs both a title and a first post, photograph or not', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('What is it about?'), 'Side guards');
    await user.upload(fileInput(), photo('guard.jpg'));
    expect(post()).toBeDisabled();
    await user.type(screen.getByLabelText('The first post'), 'Which ones last?');
    expect(post()).toBeEnabled();
  });

  it('opens the topic with no state for Home', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('What is it about?'), 'Side guards');
    await user.type(screen.getByLabelText('The first post'), 'Which ones last?');
    await user.click(post());
    await waitFor(() => {
      expect(db.navigated).toEqual([['/chat/rooms/equip/topics/topic-1', undefined]]);
    });
  });
});

describe('asking, from Home', () => {
  const fromHome = { from: 'home', segment: 'topics', kind: 'ask' };

  it('goes back to the pill on Home it came from, and changes nothing else', () => {
    renderPage(fromHome);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/home?segment=topics',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'New topic' })).toBeInTheDocument();
    expect(screen.getByLabelText('What is it about?')).toBeInTheDocument();
    expect(post()).toBeDisabled();
  });

  it('hands the topic the way back to Home', async () => {
    const user = userEvent.setup();
    renderPage(fromHome);
    await user.type(screen.getByLabelText('What is it about?'), 'Side guards');
    await user.type(screen.getByLabelText('The first post'), 'Which ones last?');
    await user.click(post());
    await waitFor(() => {
      expect(db.navigated).toEqual([
        ['/chat/rooms/equip/topics/topic-1', { from: 'home', segment: 'topics' }],
      ]);
    });
  });
});

describe('sharing a photograph, from Home', () => {
  const sharing = { from: 'home', segment: 'photos', kind: 'share' };

  it('says so, and puts the picker before the words', () => {
    renderPage(sharing);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Share a photograph' }),
    ).toBeInTheDocument();
    const title = screen.getByLabelText('Say something about it');
    const picker = screen.getByRole('button', { name: /photograph/i });
    // The picker comes first in the page, so first in reading and Tab order.
    expect(picker.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('accepts a title and a photograph with no other words', async () => {
    const user = userEvent.setup();
    renderPage(sharing);
    await user.upload(fileInput(), photo('cushion.jpg'));
    await user.type(screen.getByLabelText('Say something about it'), 'Four hours, no marks');
    expect(post()).toBeEnabled();
    await user.click(post());
    await waitFor(() => {
      expect(db.created).toEqual([
        ['equip', 'Four hours, no marks', '', ['rooms/equip/cushion.jpg']],
      ]);
    });
    expect(db.navigated).toEqual([
      ['/chat/rooms/equip/topics/topic-1', { from: 'home', segment: 'photos' }],
    ]);
  });

  it('refuses a photograph with no title, and says why', async () => {
    const user = userEvent.setup();
    renderPage(sharing);
    await user.upload(fileInput(), photo('cushion.jpg'));
    expect(post()).toBeDisabled();
    expect(
      screen.getByText('Say something about it. It is the line in the list.'),
    ).toBeInTheDocument();
  });

  it('accepts words with no photograph, as an ordinary topic', async () => {
    const user = userEvent.setup();
    renderPage(sharing);
    await user.type(screen.getByLabelText('Say something about it'), 'My first flat');
    expect(post()).toBeDisabled();
    expect(screen.getByText('Add a photograph, or some words.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/The first post/), 'Step-free, at last.');
    expect(post()).toBeEnabled();
  });

  // What somebody has just typed is the most expensive thing on the page.
  it('keeps the draft on a refusal and takes the photograph back out', async () => {
    db.failure = 'The topic was not created. You are not in this room.';
    const user = userEvent.setup();
    renderPage(sharing);
    await user.upload(fileInput(), photo('cushion.jpg'));
    await user.type(screen.getByLabelText('Say something about it'), 'Four hours, no marks');
    await user.click(post());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The topic was not created. You are not in this room.',
    );
    expect(screen.getByLabelText('Say something about it')).toHaveValue('Four hours, no marks');
    expect(db.deleted).toEqual([['rooms/equip/cushion.jpg']]);
    expect(db.navigated).toEqual([]);
  });

  it('is asking when the state says anything else', () => {
    renderPage({ from: 'home', kind: 'something' });
    expect(screen.getByRole('heading', { level: 1, name: 'New topic' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home');
  });
});

describe('what Post waits for', () => {
  it('asking wants a title and words', () => {
    expect(topicProblem('Title', '', 1, false)).not.toBeNull();
    expect(topicProblem('', 'Words', 0, false)).not.toBeNull();
    expect(topicProblem('Title', 'Words', 0, false)).toBeNull();
  });

  it('sharing wants a title, and words or a photograph', () => {
    expect(topicProblem('', '', 1, true)).not.toBeNull();
    expect(topicProblem('Title', '  ', 0, true)).not.toBeNull();
    expect(topicProblem('Title', '', 1, true)).toBeNull();
    expect(topicProblem('Title', 'Words', 0, true)).toBeNull();
  });
});
