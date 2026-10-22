import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A chat photograph goes up with its small copy, and they go together. */
const db = vi.hoisted(() => ({
  uploads: [] as [string, string][],
  removed: [] as string[][],
  copyEdge: 0,
  /** Refuse the nth photograph (not copy) uploaded; 0 refuses none. */
  refuseNth: 0,
}));

vi.mock('@/lib/image', () => ({
  preparePhoto: () =>
    Promise.resolve({ blob: new Blob(['photo'], { type: 'image/webp' }), ext: 'webp' }),
  prepareThumb: (_photo: Blob, max: number) => {
    db.copyEdge = max;
    return Promise.resolve(new Blob(['copy'], { type: 'image/webp' }));
  },
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => {
          db.uploads.push([bucket, path]);
          const nth = db.uploads.filter(([, p]) => !p.includes('.thumb.')).length;
          const refused = !path.includes('.thumb.') && nth === db.refuseNth;
          return Promise.resolve({
            error: refused ? { message: 'new row violates row-level security' } : null,
          });
        },
        remove: (paths: string[]) => {
          db.removed.push(paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
  }),
}));

const { CHAT_THUMB_EDGE, deleteAttachments, thumbPath, uploadAttachments } = await import(
  '@/lib/chat/attachments'
);

const file = () => new File(['x'], 'x.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  db.uploads = [];
  db.removed = [];
  db.copyEdge = 0;
  db.refuseNth = 0;
});

describe('chat photographs and their small copies', () => {
  it('uploads each photograph with its copy beside it, at the tile size', async () => {
    const result = await uploadAttachments([file(), file()], 'rooms/bowel');
    expect(result.ok).toBe(true);
    const paths = result.ok ? result.value : [];
    expect(paths).toHaveLength(2);
    expect(db.uploads).toEqual(
      paths.flatMap((path) => [
        ['chat', path],
        ['chat', thumbPath(path)],
      ]),
    );
    expect(db.copyEdge).toBe(CHAT_THUMB_EDGE);
  });

  it('removes the copies with the photographs', async () => {
    await deleteAttachments(['rooms/bowel/a.webp']);
    expect(db.removed).toEqual([['rooms/bowel/a.webp', 'rooms/bowel/a.thumb.webp']]);
  });

  it('takes back what went up, copies too, when a later photograph is refused', async () => {
    db.refuseNth = 2;
    const result = await uploadAttachments([file(), file()], 'rooms/bowel');
    expect(result.ok).toBe(false);
    const [first, second] = db.uploads
      .map(([, path]) => path)
      .filter((path) => !path.includes('.thumb.'));
    expect(db.removed).toEqual([[first, second, thumbPath(first ?? ''), thumbPath(second ?? '')]]);
  });
});
