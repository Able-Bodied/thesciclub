import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({ forget: vi.fn(), broke: vi.fn() }));

vi.mock('@/lib/photos', () => ({
  PHOTOS_BUCKET: 'photos',
  usePhotoUrl: (path: string | null | undefined) => (path ? `https://signed/${path}` : null),
}));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forgetSignedUrls: spies.forget,
}));
vi.mock('@/lib/shared-reads', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  photoBroke: spies.broke,
}));

const { MemberAvatar } = await import('@/components/member-avatar');

describe('a face whose file is gone', () => {
  it('falls back to the initials, signs again next time and asks for a fresh read', () => {
    const { container } = render(
      <MemberAvatar id="m1" displayName="Bea Lane" photoPath="m1/profile-old.webp" />,
    );
    const img = container.querySelector('img');
    if (!img) throw new Error('no photo drawn');
    expect(img).toHaveAttribute('src', 'https://signed/m1/profile-old.webp');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('BL')).toBeInTheDocument();
    expect(spies.forget).toHaveBeenCalledWith('photos', [
      'm1/profile-old.webp',
      'm1/profile-old.thumb.webp',
    ]);
    expect(spies.broke).toHaveBeenCalledTimes(1);
  });

  it('draws the new photo once the read names it', () => {
    const { container, rerender } = render(
      <MemberAvatar id="m1" displayName="Bea Lane" photoPath="m1/profile-old.webp" />,
    );
    const img = container.querySelector('img');
    if (!img) throw new Error('no photo drawn');
    fireEvent.error(img);
    rerender(<MemberAvatar id="m1" displayName="Bea Lane" photoPath="m1/profile-new.webp" />);
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://signed/m1/profile-new.webp',
    );
  });
});
