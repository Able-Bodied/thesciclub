import { describe, expect, it } from 'vitest';
import { photoUrlFor } from '@/lib/photos';

describe('photoUrlFor', () => {
  it('builds a public URL from a stored path', () => {
    expect(photoUrlFor('seed/abc.webp')).toContain(
      '/storage/v1/object/public/photos/seed/abc.webp',
    );
  });

  it('returns null when there is no photo, so callers fall back to initials', () => {
    expect(photoUrlFor(null)).toBeNull();
    expect(photoUrlFor(undefined)).toBeNull();
    expect(photoUrlFor('')).toBeNull();
  });
});
