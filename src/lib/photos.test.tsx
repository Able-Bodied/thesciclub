import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAttachmentUrls, useAttachmentUrls } from '@/lib/chat/attachments';
import { thumbPath, usePhotoUrl } from '@/lib/photos';
import { onPhotoBroke } from '@/lib/shared-reads';

/**
 * Photographs and logos are drawn through signed URLs (HANDOFF.md "What Home is" step 6,
 * part 2). What matters is the shape of the requests: one per screen, not
 * one per face, nothing for a member without a photograph, and nothing again
 * for a face already signed.
 */

const storage = vi.hoisted(() => ({
  calls: [] as { bucket: string; paths: string[] }[],
  refuse: new Set<string>(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[]) => {
          storage.calls.push({ bucket, paths });
          return Promise.resolve({
            data: paths.map((path) =>
              storage.refuse.has(path)
                ? { path, signedUrl: null, error: 'Either the object does not exist' }
                : { path, signedUrl: `https://signed.test/${bucket}/${path}?token=t`, error: null },
            ),
            error: null,
          });
        },
      }),
    },
  }),
}));

// Counted: a refused photograph counts as a broken one.
const broke = { count: 0 };
onPhotoBroke(() => {
  broke.count += 1;
});

function Face({ path }: { path: string | null }) {
  const url = usePhotoUrl(path);
  return <span data-testid={path ?? 'none'}>{url ?? 'initials'}</span>;
}

beforeEach(() => {
  localStorage.clear();
  resetAttachmentUrls();
  storage.calls = [];
  storage.refuse = new Set();
  broke.count = 0;
});

describe('usePhotoUrl', () => {
  it('asks for nothing when there is no photograph', async () => {
    render(<Face path={null} />);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(screen.getByTestId('none')).toHaveTextContent('initials');
    expect(storage.calls).toEqual([]);
  });

  it('draws the initials until the URL arrives, then the photograph', async () => {
    render(<Face path="seed/a.webp" />);
    expect(screen.getByTestId('seed/a.webp')).toHaveTextContent('initials');
    await waitFor(() => {
      expect(screen.getByTestId('seed/a.webp')).toHaveTextContent(
        'https://signed.test/photos/seed/a.webp?token=t',
      );
    });
  });

  it('signs a screen of faces in one request, each path once', async () => {
    render(
      <>
        <Face path="seed/a.webp" />
        <Face path="seed/b.webp" />
        <Face path="u1/profile.webp" />
        <Face path="seed/a.webp" />
        <Face path="organizations/ncs.png" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('organizations/ncs.png')).not.toHaveTextContent('initials');
    });
    expect(storage.calls).toHaveLength(1);
    expect(storage.calls[0]?.bucket).toBe('photos');
    expect([...(storage.calls[0]?.paths ?? [])].sort()).toEqual([
      'organizations/ncs.png',
      'seed/a.webp',
      'seed/b.webp',
      'u1/profile.webp',
    ]);
  });

  it('draws a face already signed on the first render, and asks again for nothing', async () => {
    const first = render(<Face path="seed/a.webp" />);
    await waitFor(() => {
      expect(screen.getByTestId('seed/a.webp')).not.toHaveTextContent('initials');
    });
    first.unmount();

    render(<Face path="seed/a.webp" />);
    // Synchronously, before any effect has had a chance to run.
    expect(screen.getByTestId('seed/a.webp')).not.toHaveTextContent('initials');
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(storage.calls).toHaveLength(1);
  });

  it('keeps the initials for a path storage refuses', async () => {
    storage.refuse.add('seed/gone.webp');
    render(
      <>
        <Face path="seed/gone.webp" />
        <Face path="seed/a.webp" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('seed/a.webp')).not.toHaveTextContent('initials');
    });
    expect(screen.getByTestId('seed/gone.webp')).toHaveTextContent('initials');
  });

  // The robots, 2026-11-04: a changed photo's old file refused at signing
  // drew initials with no image error, so nothing was read again.
  it('counts a refused photograph as broken, once per path', async () => {
    storage.refuse.add('u1/profile-old.webp');
    const first = render(<Face path="u1/profile-old.webp" />);
    await waitFor(() => {
      expect(broke.count).toBe(1);
    });
    first.unmount();
    render(<Face path="u1/profile-old.webp" />);
    await waitFor(() => {
      expect(storage.calls).toHaveLength(2);
    });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(broke.count).toBe(1);
    expect(screen.getByTestId('u1/profile-old.webp')).toHaveTextContent('initials');
  });

  // The robots, 2026-11-04: three refused logos read the directory again.
  it('reads nothing again for a refused logo, event picture or review picture', async () => {
    const paths = [
      'organizations/aby.png',
      'organizations/o1/5c1e.webp',
      'events/e1/9f2a.webp',
      'reviews/r1/77aa.jpg',
    ];
    for (const path of paths) storage.refuse.add(path);
    render(
      <>
        {paths.map((path) => (
          <Face key={path} path={path} />
        ))}
      </>,
    );
    await waitFor(() => {
      expect(storage.calls).toHaveLength(1);
    });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(broke.count).toBe(0);
  });

  it('keeps the two buckets apart: a chat path is signed from chat', async () => {
    const { result } = renderHook(() => useAttachmentUrls(['rooms/bowel/x.webp']));
    await waitFor(() => {
      expect(result.current.get('rooms/bowel/x.webp')).toBe(
        'https://signed.test/chat/rooms/bowel/x.webp?token=t',
      );
    });
    expect(storage.calls).toEqual([{ bucket: 'chat', paths: ['rooms/bowel/x.webp'] }]);
  });
});

describe('small copies', () => {
  function Small({ path }: { path: string }) {
    const url = usePhotoUrl(path, 'thumb');
    return <span data-testid={path}>{url ?? 'initials'}</span>;
  }

  it('names the copy beside the photograph', () => {
    expect(thumbPath('u1/profile-1a2b.webp')).toBe('u1/profile-1a2b.thumb.webp');
    expect(thumbPath('u1/profile.jpg')).toBe('u1/profile.thumb.jpg');
  });

  it('draws the copy, signed in the same request as the photograph', async () => {
    render(<Small path="u1/profile.webp" />);
    await waitFor(() => {
      expect(screen.getByTestId('u1/profile.webp')).toHaveTextContent(
        'https://signed.test/photos/u1/profile.thumb.webp?token=t',
      );
    });
    expect(storage.calls).toEqual([
      { bucket: 'photos', paths: ['u1/profile.thumb.webp', 'u1/profile.webp'] },
    ]);
  });

  it('draws the photograph where there is no copy, and does not ask for the copy again', async () => {
    storage.refuse.add('u1/old.thumb.webp');
    const first = render(<Small path="u1/old.webp" />);
    await waitFor(() => {
      expect(screen.getByTestId('u1/old.webp')).toHaveTextContent(
        'https://signed.test/photos/u1/old.webp?token=t',
      );
    });
    first.unmount();
    render(<Small path="u1/old.webp" />);
    expect(screen.getByTestId('u1/old.webp')).toHaveTextContent(
      'https://signed.test/photos/u1/old.webp?token=t',
    );
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(storage.calls).toHaveLength(1);
    // A missing copy is not a changed photo.
    expect(broke.count).toBe(0);
  });
});

describe('across a reload', () => {
  const KEPT = 'thesciclub.signed-photos';

  /** A fresh copy of the modules, as a reload would load them. */
  async function reload() {
    vi.resetModules();
    return {
      photos: await import('@/lib/photos'),
      attachments: await import('@/lib/chat/attachments'),
    };
  }

  // Measured: a reload re-signed every face and, with a new token in every
  // URL, downloaded every photograph again — about half a second at 150ms.
  it('keeps a signed face, so a reload draws it at once and asks for nothing', async () => {
    render(<Face path="seed/a.webp" />);
    await waitFor(() => {
      expect(screen.getByTestId('seed/a.webp')).not.toHaveTextContent('initials');
    });

    const { photos } = await reload();
    function Again() {
      return <span data-testid="again">{photos.usePhotoUrl('seed/a.webp') ?? 'initials'}</span>;
    }
    render(<Again />);
    expect(screen.getByTestId('again')).toHaveTextContent(
      'https://signed.test/photos/seed/a.webp?token=t',
    );
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(storage.calls).toHaveLength(1);
  });

  it('signs again what was kept past its time', async () => {
    localStorage.setItem(
      KEPT,
      JSON.stringify({ 'seed/a.webp': { url: 'https://signed.test/old', until: Date.now() - 1 } }),
    );
    const { photos } = await reload();
    function Again() {
      return <span data-testid="again">{photos.usePhotoUrl('seed/a.webp') ?? 'initials'}</span>;
    }
    render(<Again />);
    expect(screen.getByTestId('again')).toHaveTextContent('initials');
    await waitFor(() => {
      expect(screen.getByTestId('again')).toHaveTextContent(
        'https://signed.test/photos/seed/a.webp?token=t',
      );
    });
  });

  it('never keeps a chat photograph’s URL', async () => {
    renderHook(() => useAttachmentUrls(['threads/t1/x.webp']));
    render(<Face path="seed/a.webp" />);
    await waitFor(() => {
      expect(storage.calls).toHaveLength(2);
    });
    await waitFor(() => {
      expect(localStorage.getItem(KEPT)).toContain('seed/a.webp');
    });
    expect(localStorage.getItem(KEPT)).not.toContain('threads/t1/x.webp');
  });

  it('forgets every kept URL on a reset, which is what signing out does', async () => {
    render(<Face path="seed/a.webp" />);
    await waitFor(() => {
      expect(localStorage.getItem(KEPT)).toContain('seed/a.webp');
    });
    resetAttachmentUrls();
    expect(localStorage.getItem(KEPT)).toBeNull();
  });
});
