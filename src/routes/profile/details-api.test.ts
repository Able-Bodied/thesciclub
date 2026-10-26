import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detailsPercent,
  listInWords,
  loadDetails,
  type MemberDetails,
  missingDetails,
  saveDetails,
  setShowOnMap,
} from '@/routes/profile/details-api';

/** Only `@/lib/supabase` is stubbed, for loading and saving. */
const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  selected: '',
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: (columns: string) => {
        db.selected = columns;
        return { maybeSingle: () => Promise.resolve({ data: db.row, error: null }) };
      },
      update: (values: Record<string, unknown>) => {
        db.updates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

beforeEach(() => {
  db.row = null;
  db.updates = [];
  db.selected = '';
});

const details = (o: Partial<MemberDetails> = {}): MemberDetails => ({
  displayName: 'Dana',
  birthDate: '1990-04-02',
  exactLevel: 'C7',
  injuryType: 'quad',
  conditionName: '',
  completeness: 'Incomplete',
  injuryDate: '2013-01-01',
  injuryDatePrecision: 'year',
  city: 'San Jose',
  state: 'CA',
  photoPath: 'u1/profile.jpg',
  photoAlt: null,
  showInBrowse: true,
  showOnMap: true,
  declined: [],
  ...o,
});

describe('what is still blank', () => {
  it('finds nothing on a complete profile', () => {
    expect(missingDetails(details())).toEqual([]);
  });

  // The state onboarding now leaves people in: name and birthday, nothing else.
  it('names everything a skipped signup leaves behind', () => {
    const bare = details({
      exactLevel: null,
      injuryDate: null,
      injuryDatePrecision: null,
      city: null,
      state: '',
      photoPath: null,
    });
    expect(missingDetails(bare)).toEqual([
      'a photo',
      'your injury or condition',
      'when you were injured',
      'your city',
      'your state',
    ]);
  });

  // 'Do not know' is an honest answer a lot of people will give, and counting
  // it as a gap would nag somebody to replace a fact with a guess.
  it('does not count "Do not know" as unanswered', () => {
    expect(missingDetails(details({ completeness: 'Do not know' }))).toEqual([]);
  });

  // Neither can be absent: the row requires both.
  it('never counts the name or the birthday', () => {
    expect(missingDetails(details({ displayName: '', birthDate: '' }))).toEqual([]);
  });
});

describe('listing them in words', () => {
  it('reads as a sentence rather than a comma dump', () => {
    expect(listInWords(['a photo'])).toBe('a photo');
    expect(listInWords(['a photo', 'your city'])).toBe('a photo and your city');
    expect(listInWords(['a photo', 'your city', 'your state'])).toBe(
      'a photo, your city and your state',
    );
  });

  it('is empty when nothing is missing', () => {
    expect(listInWords([])).toBe('');
  });
});

describe('declining a detail', () => {
  it('stops counting it as missing', () => {
    const bare = details({ photoPath: null, city: null });
    expect(missingDetails(bare)).toContain('a photo');
    expect(missingDetails({ ...bare, declined: ['photo'] })).not.toContain('a photo');
    expect(missingDetails({ ...bare, declined: ['photo'] })).toContain('your city');
  });

  it('counts towards the percentage the way an answer does', () => {
    const bare = details({ photoPath: null, exactLevel: null, injuryDate: null, city: null });
    const before = detailsPercent(bare);
    expect(detailsPercent({ ...bare, declined: ['photo'] })).toBeGreaterThan(before);
  });

  it('reaches 100 when everything is either given or declined', () => {
    // The case the owner asked for. Somebody who will never put a photograph
    // up should not be shown an unfinished profile for ever.
    const bare = details({ photoPath: null, exactLevel: null, injuryDate: null, city: null });
    const allDeclined = {
      ...bare,
      declined: ['photo', 'exactLevel', 'injuryDate', 'city', 'state'],
    };
    expect(detailsPercent(allDeclined)).toBe(100);
    expect(missingDetails(allDeclined)).toEqual([]);
  });

  it('is 100 for a profile that is simply filled in', () => {
    expect(detailsPercent(details())).toBe(100);
  });

  // A stale key from a question the form no longer asks should sit there
  // harmlessly rather than counting as progress on something else.
  it('ignores a key that is not one of the five', () => {
    const bare = details({ photoPath: null });
    expect(detailsPercent({ ...bare, declined: ['somethingElse'] })).toBe(detailsPercent(bare));
  });
});

describe('the spinal cord answer, loaded and saved', () => {
  const row = (o: Record<string, unknown>) => ({
    display_name: 'Dana',
    birth_date: '1990-04-02',
    exact_level: null,
    injury_type: null,
    condition_name: null,
    completeness: 'Do not know',
    state: 'CA',
    ...o,
  });

  it("loads the kind and a condition in the member's words", async () => {
    db.row = row({ injury_type: 'condition', condition_name: 'Transverse myelitis' });
    const loaded = await loadDetails();
    expect(loaded.ok && [loaded.details.injuryType, loaded.details.conditionName]).toEqual([
      'condition',
      'Transverse myelitis',
    ]);
  });

  it('starts somebody from before the question at their level, without saving it', async () => {
    db.row = row({ exact_level: 'C6' });
    const loaded = await loadDetails();
    expect(loaded.ok && loaded.details.injuryType).toBe('quad');
    db.row = row({ exact_level: null });
    const blank = await loadDetails();
    expect(blank.ok && blank.details.injuryType).toBeNull();
    expect(db.updates).toEqual([]);
  });

  it("saves a condition's name trimmed, and none for any other kind", async () => {
    await saveDetails(
      'u1',
      details({ injuryType: 'condition', conditionName: ' Spina bifida ', exactLevel: null }),
      'Not sure yet',
    );
    await saveDetails(
      'u1',
      details({ injuryType: 'para', conditionName: 'left over', exactLevel: 'T6' }),
      'T1–T6',
    );
    expect(db.updates.map((u) => [u.injury_type, u.condition_name])).toEqual([
      ['condition', 'Spina bifida'],
      ['para', null],
    ]);
  });

  it("counts a condition's name as answering the level", () => {
    expect(
      missingDetails(
        details({ exactLevel: null, injuryType: 'condition', conditionName: 'Spina bifida' }),
      ),
    ).not.toContain('your injury or condition');
  });
});

describe('show me on the map', () => {
  it('is read with the details, and on unless turned off', async () => {
    db.row = { display_name: 'Dana', state: 'CA', show_on_map: false };
    const off = await loadDetails();
    expect(db.selected).toContain('show_on_map');
    expect(off.ok && off.details.showOnMap).toBe(false);
    db.row = { display_name: 'Dana', state: 'CA' };
    const unset = await loadDetails();
    expect(unset.ok && unset.details.showOnMap).toBe(true);
  });

  it('is written on its own, and never by Save', async () => {
    expect(await setShowOnMap('u1', false)).toEqual({ ok: true });
    await saveDetails('u1', details({ showOnMap: true }), 'C5–C8');
    expect(db.updates[0]).toEqual({ show_on_map: false });
    expect(db.updates[1]).not.toHaveProperty('show_on_map');
  });
});
