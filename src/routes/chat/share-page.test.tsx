import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '@/lib/chat/attachments';
import type * as Rooms from '@/lib/chat/rooms';
import type * as Topics from '@/lib/chat/topics';
import type * as ShareTarget from '@/lib/share-target';
import type { Shared } from '@/lib/share-target';
import { makeRoom } from '@/test/factory';

const db = vi.hoisted(() => ({
  shared: null as Shared | null,
  uploads: [] as [number, string][],
  created: [] as unknown[][],
}));

vi.mock('@/lib/share-target', async (importOriginal) => ({
  ...(await importOriginal<typeof ShareTarget>()),
  takeShared: () => Promise.resolve(db.shared),
}));
vi.mock('@/lib/chat/rooms', async (importOriginal) => ({
  ...(await importOriginal<typeof Rooms>()),
  useChatRooms: () => ({
    rooms: [
      makeRoom({ id: 'general', name: 'General', category: 'General' }),
      makeRoom({ id: 'equip', name: 'Equipment', category: 'Kit' }),
    ],
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  uploadAttachments: (files: File[], folder: string) => {
    db.uploads.push([files.length, folder]);
    return Promise.resolve({ ok: true, value: files.map((_, i) => `${folder}/p${i}.webp`) });
  },
}));
vi.mock('@/lib/chat/topics', async (importOriginal) => ({
  ...(await importOriginal<typeof Topics>()),
  createTopic: (...args: unknown[]) => {
    db.created.push(args);
    return Promise.resolve({ ok: true, value: 'shared-topic' });
  },
}));

const { default: SharePage } = await import('@/routes/chat/share-page');

function Where() {
  return <p>at {useLocation().pathname}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/share']}>
      <Routes>
        <Route path="/share" element={<SharePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.shared = null;
  db.uploads = [];
  db.created = [];
  URL.createObjectURL = vi.fn(() => 'blob:shared');
  URL.revokeObjectURL = vi.fn();
});

describe('sharing to the club from another app', () => {
  it('lays a shared link out as a topic, General unless another room is chosen', async () => {
    db.shared = {
      title: 'Accessible cabins',
      text: 'Worth a look',
      url: 'https://x.example',
      files: [],
    };
    renderPage();
    expect(await screen.findByLabelText('Say something about it')).toHaveValue('Accessible cabins');
    expect(screen.getByLabelText(/More detail/)).toHaveValue('Worth a look\nhttps://x.example');
    expect(screen.getByLabelText('Room')).toHaveValue('general');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Post it' }));
    await waitFor(() => {
      expect(db.created).toEqual([
        ['general', 'Accessible cabins', 'Worth a look\nhttps://x.example', [], false],
      ]);
    });
    expect(
      await screen.findByText('at /chat/rooms/general/topics/shared-topic'),
    ).toBeInTheDocument();
  });

  it('uploads shared photographs to the chosen room and posts them', async () => {
    db.shared = {
      title: '',
      text: '',
      url: '',
      files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
    };
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByRole('img', { name: 'Shared photograph 1 of 1' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Say something about it'), 'My new ramp');
    await user.selectOptions(screen.getByLabelText('Room'), 'equip');
    await user.click(screen.getByRole('button', { name: 'Post it' }));
    await waitFor(() => {
      expect(db.created).toEqual([['equip', 'My new ramp', '', ['rooms/equip/p0.webp'], false]]);
    });
    expect(db.uploads).toEqual([[1, 'rooms/equip']]);
  });

  it('says so when nothing was shared, or it was already posted', async () => {
    renderPage();
    expect(await screen.findByText(/Nothing was shared/)).toBeInTheDocument();
  });
});
