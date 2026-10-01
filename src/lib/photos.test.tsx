import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAttachmentUrls, useAttachmentUrls } from '@/lib/chat/attachments';
import { usePhotoUrl } from '@/lib/photos';

/**
 * Photographs and logos are drawn through signed URLs (HOME-PLAN.md step 6,
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

function Face({ path }: { path: string | null }) {
  const url = usePhotoUrl(path);
  return <span data-testid={path ?? 'none'}>{url ?? 'initials'}</span>;
}

beforeEach(() => {
  resetAttachmentUrls();
  storage.calls = [];
  storage.refuse = new Set();
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
