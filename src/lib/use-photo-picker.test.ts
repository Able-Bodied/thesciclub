import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_SOURCE_BYTES } from '@/lib/chat/attachments';
import { usePhotoPicker } from '@/lib/use-photo-picker';

const native = vi.hoisted(() => ({ pick: vi.fn(), release: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isPluginAvailable: (name: string) => name === 'PhotoSelection',
    convertFileSrc: () => 'capacitor://localhost/_capacitor_file_/photo.jpg',
  },
  registerPlugin: () => native,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

it('passes the open slots to iOS and turns the selection into files before releasing the transfer', async () => {
  native.pick.mockResolvedValue({
    photos: [{ url: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }],
    transfer: 'transfer-1',
  });
  native.release.mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue(new Response('photo data'));
  vi.stubGlobal('fetch', fetch);
  const add = vi.fn();
  const onError = vi.fn();
  const { result, rerender } = renderHook(
    ({ remaining }) => usePhotoPicker({ remaining, add, onError }),
    { initialProps: { remaining: 4 } },
  );
  rerender({ remaining: 2 });
  act(() => {
    result.current.open();
  });

  await waitFor(() => {
    expect(add).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'photo.jpg', type: 'image/jpeg', size: 10 })],
      null,
    );
  });
  expect(native.pick).toHaveBeenCalledWith({ limit: 2, maxBytes: MAX_SOURCE_BYTES });
  expect(fetch).toHaveBeenCalledWith('capacitor://localhost/_capacitor_file_/photo.jpg');
  expect(native.release).toHaveBeenCalledWith({ transfer: 'transfer-1' });
  expect(onError).not.toHaveBeenCalled();
});
