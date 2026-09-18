import { describe, expect, it } from 'vitest';
import {
  detailsPercent,
  listInWords,
  type MemberDetails,
  missingDetails,
} from '@/routes/profile/details-api';

const details = (o: Partial<MemberDetails> = {}): MemberDetails => ({
  displayName: 'Dana',
  birthDate: '1990-04-02',
  exactLevel: 'C7',
  completeness: 'Incomplete',
  injuryDate: '2013-01-01',
  injuryDatePrecision: 'year',
  city: 'San Jose',
  state: 'CA',
  photoPath: 'u1/profile.jpg',
  showInBrowse: true,
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
      'your injury level',
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
