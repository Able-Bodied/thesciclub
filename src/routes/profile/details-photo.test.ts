import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePhoto } from '@/routes/profile/details-api';

/** A new photograph is a new file, so a reported one is never overwritten. */
const db = vi.hoisted(() => ({
  uploads: [] as string[],
  removed: [] as string[][],
  updates: [] as Record<string, unknown>[],
  existing: ['profile.webp', 'profile.jpg'],
}));

vi.mock('@/lib/image', () => ({
  preparePhoto: () =>
    Promise.resolve({ blob: new Blob(['x'], { type: 'image/webp' }), ext: 'webp' }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        upload: (path: string) => {
          db.uploads.push(path);
          return Promise.resolve({ error: null });
        },
        list: () =>
          Promise.resolve({
            data: [...db.existing, ...db.uploads.map((p) => p.split('/')[1] ?? '')].map((name) => ({
              name,
            })),
            error: null,
          }),
        remove: (paths: string[]) => {
          db.removed.push(paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
    from: () => ({
      update: (values: Record<string, unknown>) => {
        db.updates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

beforeEach(() => {
  db.uploads = [];
  db.removed = [];
  db.updates = [];
});

describe('savePhoto', () => {
  it('uploads under a fresh name each time, never onto profile.<ext>', async () => {
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    const first = await savePhoto('u1', file);
    const second = await savePhoto('u1', file);
    expect(db.uploads).toHaveLength(2);
    for (const path of db.uploads) expect(path).toMatch(/^u1\/profile-[0-9a-f]{8}\.webp$/);
    expect(db.uploads[0]).not.toBe(db.uploads[1]);
    expect(first).toEqual({ ok: true, path: db.uploads[0] });
    expect(second).toEqual({ ok: true, path: db.uploads[1] });
    expect(db.updates[0]).toEqual({ photo_path: db.uploads[0], photo_alt: null });
  });

  it('clears the other files in the folder, and keeps the new one', async () => {
    await savePhoto('u1', new File(['x'], 'me.png', { type: 'image/png' }));
    const kept = db.uploads[0]?.split('/')[1];
    expect(db.removed).toEqual([['u1/profile.webp', 'u1/profile.jpg']]);
    expect(db.removed.flat()).not.toContain(`u1/${kept}`);
  });
});
