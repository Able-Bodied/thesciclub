import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingData } from '@/routes/onboarding/types';
import { INITIAL_ONBOARDING_DATA } from '@/routes/onboarding/types';

/**
 * A refused photograph stops the signup before the member row is written,
 * so the page can say why on the photo step (HANDOFF.md "What Home is" step 6). The
 * refusal carries the name and the code storage-js gives it, as the real
 * one does — a fixture without it would be sorted by its wording and pass while
 * the real thing did not (HANDOFF.md, "Errors read as sentences").
 */

const db = vi.hoisted(() => ({
  uploadError: null as { name: string; message: string; code?: string } | null,
  uploads: [] as string[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/image', () => ({
  preparePhoto: (file: File) => Promise.resolve({ blob: file, ext: 'heic' }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'u1', phone: '14085550112' } } } }),
    },
    storage: {
      from: () => ({
        upload: (path: string) => {
          db.uploads.push(path);
          return Promise.resolve({ error: db.uploadError });
        },
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        db.inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const { submitOnboarding } = await import('@/routes/onboarding/submit-onboarding');

const data = (o: Partial<OnboardingData> = {}): OnboardingData => ({
  ...INITIAL_ONBOARDING_DATA,
  displayName: 'Dana',
  birthDate: '1990-04-02',
  ...o,
});
const photo = () => new File(['x'], 'photo.heic', { type: 'image/heic' });

beforeEach(() => {
  db.uploadError = null;
  db.uploads = [];
  db.inserts = [];
});

describe('submitOnboarding and the photograph', () => {
  it('writes no row and says why when storage refuses the photograph', async () => {
    db.uploadError = {
      name: 'StorageApiError',
      message: 'mime type image/heic is not supported',
      code: 'InvalidMimeType',
    };
    const result = await submitOnboarding(data({ photoFile: photo() }));

    expect(result).toEqual({
      ok: false,
      photoRefused: true,
      error: "That kind of file can't be used. Try a JPEG or PNG.",
    });
    expect(db.inserts).toEqual([]);
  });

  it('says a photograph is too large in the same place', async () => {
    db.uploadError = {
      name: 'StorageApiError',
      message: 'The object exceeded the maximum allowed size',
      code: 'EntityTooLarge',
    };
    const result = await submitOnboarding(data({ photoFile: photo() }));

    expect(result.photoRefused).toBe(true);
    expect(result.error).toMatch(/^That photo is too large\. Try a smaller one\.$/);
    expect(db.inserts).toEqual([]);
  });

  it('writes the row with the photograph once it is stored', async () => {
    const result = await submitOnboarding(data({ photoFile: photo() }));

    expect(result).toEqual({ ok: true });
    expect(db.uploads).toEqual(['u1/profile.heic']);
    expect(db.inserts[0]?.photo_path).toBe('u1/profile.heic');
  });

  // Read by the claim trigger: true retires a claimed seed without copying it
  // (20261002000000). An insert that leaves it out gets the old behaviour.
  it('carries "Start fresh" to the insert', async () => {
    await submitOnboarding(data({ startFresh: true }));
    await submitOnboarding(data());

    expect(db.inserts.map((row) => row.start_fresh)).toEqual([true, false]);
  });

  // Declined, then gone Back to and answered: the answer wins, as on the
  // details form.
  it('lifts a decline that was answered after all', async () => {
    await submitOnboarding(
      data({ declined: ['exactLevel', 'injuryDate', 'city', 'state'], state: 'CA' }),
    );
    expect(db.inserts[0]?.declined).toEqual(['exactLevel', 'injuryDate', 'city']);
  });

  it('uploads nothing without a photograph', async () => {
    const result = await submitOnboarding(data());

    expect(result).toEqual({ ok: true });
    expect(db.uploads).toEqual([]);
    expect(db.inserts[0]?.photo_path).toBeNull();
  });
});
