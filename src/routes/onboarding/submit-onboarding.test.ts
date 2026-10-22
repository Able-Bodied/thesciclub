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
  signedIn: true,
  insertError: null as { message: string; code?: string } | null,
  uploadError: null as { name: string; message: string; code?: string } | null,
  uploads: [] as string[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/image', () => ({
  preparePhoto: (file: File) => Promise.resolve({ blob: file, ext: 'heic' }),
  // A HEIC that could not be fitted gets no small copy.
  prepareThumb: () => Promise.resolve(null),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          // An email account: no phone on the session at all.
          data: { session: db.signedIn ? { user: { id: 'u1', email: 'dana@example.com' } } : null },
        }),
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
        return Promise.resolve({ error: db.insertError });
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
  db.signedIn = true;
  db.insertError = null;
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

  it('writes the username, lowercase, and no longer asks for a phone on the session', async () => {
    const result = await submitOnboarding(data({ username: ' Dana.S ' }));

    expect(result).toEqual({ ok: true });
    expect(db.inserts[0]?.username).toBe('dana.s');
    expect(db.inserts[0]?.id).toBe('u1');
  });

  it('writes the typed number "for events", or null when it was skipped', async () => {
    await submitOnboarding(data({ phone: '(408) 555-0112' }));
    await submitOnboarding(data({ phone: '' }));
    await submitOnboarding(data({ phone: '408555' }));

    expect(db.inserts.map((row) => row.phone)).toEqual(['14085550112', null, null]);
  });

  it("writes the kind with its level, or a condition in the member's words", async () => {
    await submitOnboarding(data({ injuryType: 'para', exactLevel: 'T6' }));
    await submitOnboarding(
      data({ injuryType: 'condition', conditionName: '  Transverse myelitis ', exactLevel: null }),
    );
    await submitOnboarding(
      data({ injuryType: 'central_cord', exactLevel: 'C5', completeness: 'Incomplete' }),
    );
    expect(
      db.inserts.map((r) => [r.injury_type, r.condition_name, r.exact_level, r.level_range]),
    ).toEqual([
      ['para', null, 'T6', 'T1–T6'],
      ['condition', 'Transverse myelitis', null, 'Not sure yet'],
      ['central_cord', null, 'C5', 'C5–C8'],
    ]);
  });

  it('leaves the kind unsaid when it was not answered', async () => {
    await submitOnboarding(data({ injuryType: 'quad', exactLevel: null }));
    await submitOnboarding(data({ injuryType: 'condition', conditionName: ' ' }));
    await submitOnboarding(data({ injuryType: null, exactLevel: null }));
    expect(db.inserts.map((r) => [r.injury_type, r.condition_name])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it("counts a condition's name as answering the level, so its decline is dropped", async () => {
    await submitOnboarding(
      data({
        injuryType: 'condition',
        conditionName: 'Spina bifida',
        declined: ['exactLevel'],
      }),
    );
    expect(db.inserts[0]?.declined).toEqual([]);
  });

  it('sends nothing about a seeded profile', async () => {
    await submitOnboarding(data());
    expect(db.inserts[0]).not.toHaveProperty('start_fresh');
  });

  it('refuses without a session, and writes nothing', async () => {
    db.signedIn = false;
    const result = await submitOnboarding(data());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not signed in/);
    expect(db.inserts).toEqual([]);
  });

  it('sends them back to the username when somebody else took it a moment ago', async () => {
    db.insertError = {
      message: 'duplicate key value violates unique constraint "members_username_key"',
      code: '23505',
    };
    const result = await submitOnboarding(data({ username: 'dana' }));

    expect(result).toEqual({
      ok: false,
      usernameRefused: true,
      error: 'That username was just taken. Choose another.',
    });
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
